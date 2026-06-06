/**
 * GraphRenderer — Canvas-based visualization for the SkyRoute aviation network.
 *
 * Renders a directed weighted graph where:
 *   - Nodes  → Airports (hubs in red, secondary in blue)
 *   - Edges  → Directed routes with distance labels and aircraft type markers
 *
 * Inspired by the project's TreeVisualizer but adapted for general directed graphs
 * using a force-directed layout simulation.
 *
 * CHANGES v1.1:
 *   - Bidirectional pairs now render as ONE line with arrowheads at BOTH ends,
 *     reducing visual edge count from ~172 to ~86.
 *   - Aircraft-type dots moved from the middle of the edge to a cluster
 *     beside the source vertex (perpendicular offset from edge direction).
 *
 * CHANGES v1.2:
 *   - Aircraft-type dots moved from per-edge to per-NODE: each airport now
 *     shows a centered row of dots below its circle, one dot per unique
 *     aircraft type across ALL its outgoing routes. Eliminates the pile-up
 *     of duplicate dots when a hub has many connections.
 *
 * @author  SkyRoute Team
 * @version 1.2
 */

export class GraphRenderer {
  /**
   * @param {string} canvasId - ID of the <canvas> element to draw on.
   */
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas)
      throw new Error(`[GraphRenderer] Canvas #${canvasId} not found`);
    this.ctx = this.canvas.getContext("2d");

    // ── Node visual config ────────────────────────────────────
    this.HUB_RADIUS = 42;
    this.SECONDARY_RADIUS = 32;

    // ── Color palette (mirrors app.css CSS vars semantically) ─
    this.colors = {
      hub: "#ef4444", // Red   – Hub airports
      secondary: "#3b82f6", // Blue  – Secondary airports
      nodeSelected: "#10b981", // Green – Selected / active node
      nodeCurrent: "#09dbe2", // Cyan  – Current traveller position
      nodeHover: "#f59e0b", // Amber – Hovered node
      nodeInPath: "#8b5cf6", // Purple – Node belonging to highlighted path

      edgeActive: "#94a3b8", // Slate  – Normal route
      edgeBlocked: "#ef4444", // Red    – Blocked route
      edgeHighlight: "#10b981", // Green  – Route inside highlighted path

      nodeBorder: "#1e293b", // Dark   – Circle border
      nodeText: "#ffffff", // White  – Text inside node
      edgeLabelBg: "rgba(255,255,255,0.90)",
      edgeLabelText: "#374151",

      background: "#f9fafb", // Light grey – Canvas background
      gridLine: "#e5e7eb", // Light grid

      // Aircraft type dot colors
      aircraftComercial: "#8b5cf6",
      aircraftRegional: "#06b6d4",
      aircraftHelice: "#f59e0b",
    };

    // ── Viewport ──────────────────────────────────────────────
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 20;
    this.worldWidth = 1200;
    this.worldHeight = 800;

    // ── Graph data ────────────────────────────────────────────
    /** @type {Array<GraphNode>}  */ this.nodes = [];
    /** @type {Array<GraphEdge>}  */ this.links = [];
    /** @type {Object}            */ this.nodeMap = {}; // id → node

    // ── Interaction state ─────────────────────────────────────
    this.selectedNode = null;
    this.selectedEdge = null;
    this.hoveredNode = null;
    this.currentNode = null; // IATA code of the traveller's current airport
    this.highlightedPath = []; // Array<string> of IATA codes

    // ── Angular-spread cache (recomputed each frame) ──────────
    // Maps `${src}|${tgt}` → { srcOff, tgtOff } in radians.
    // Ensures edges leaving/entering a node are distributed
    // around its perimeter instead of clustering at one point.
    this._spreadAngles = null;

    // ── Force-directed simulation ─────────────────────────────
    this.simRunning = false;
    this.simTick = 0;
    this.SIM_MAX_TICKS = 500;
    this.SIM_IDEAL_DIST = 420; // Ideal spring length (px)

    // ── Public callbacks ──────────────────────────────────────
    /** Called when user clicks a node. @type {(node: GraphNode) => void} */
    this.onNodeSelected = null;
    /** Called when user clicks an edge. @type {(edge: GraphEdge) => void} */
    this.onEdgeSelected = null;
    /** Called when nothing is clicked (deselection). @type {() => void} */
    this.onDeselect = null;

    this._resize();
    window.addEventListener("resize", () => {
      this._resize();
      if (this.nodes.length) {
        this._fitWorldToView();
        this._draw();
      }
    });
    this._initMouseEvents();
  }

  // ════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════

  /**
   * Load a new graph from the backend response (GET /api/graph/load).
   * Triggers a force-directed simulation to place nodes, then draws.
   *
   * @param {{ nodes: Array, links: Array, config: Object }} graphData
   */
  loadGraph(graphData) {
    const { nodes, links } = graphData;
    this._configureWorld(nodes.length, links.length);
    this._fitWorldToView();

    const cx = this.worldWidth / 2;
    const cy = this.worldHeight / 2;

    // Build internal node objects with spread-out starting positions.
    this.nodes = nodes.map((n, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(nodes.length, 1);
      const hubFactor = n.isHub ? 0.72 : 0.98;
      const jitter = ((i % 5) - 2) * 18;
      return {
        id: n.id,
        label: n.label || n.id,
        isHub: !!n.isHub,
        metadata: n.metadata || {},
        x: cx + Math.cos(angle) * this.worldWidth * 0.36 * hubFactor + jitter,
        y: cy + Math.sin(angle) * this.worldHeight * 0.34 * hubFactor - jitter,
        vx: 0,
        vy: 0,
        radius: n.isHub ? this.HUB_RADIUS : this.SECONDARY_RADIUS,
      };
    });

    this.nodeMap = {};
    this.nodes.forEach((n) => {
      this.nodeMap[n.id] = n;
    });

    // Copy edge data as-is (source/target are IATA codes)
    this.links = links.map((l) => ({ ...l }));

    // Cancel any in-progress flight animation
    if (this._flightAnim) this._flightAnim.active = false;
    this._flightAnim = null;

    // Reset interaction
    this.selectedNode = null;
    this.selectedEdge = null;
    this.hoveredNode = null;
    this.highlightedPath = [];
    this.highlightedSegments = [];

    this._startSimulation();
  }

  /**
   * Highlight a sequence of IATA codes forming a route on the graph.
   * @param {string[]} nodeIds
   */
  highlightPath(nodeIds, segments = []) {
    this.highlightedPath = Array.isArray(nodeIds) ? nodeIds : [];
    this.highlightedSegments = Array.isArray(segments) ? segments : [];
    this._draw();
  }

  /** Mark the traveller's current airport node with the cyan indicator. */
  setCurrentNode(nodeId) {
    this.currentNode = nodeId ?? null;
    this._draw();
  }

  /** Clear all highlights and selections. */
  clearHighlight() {
    if (this._flightAnim) this._flightAnim.active = false;
    this._flightAnim = null;
    this.highlightedPath = [];
    this.highlightedSegments = [];
    this.selectedNode = null;
    this.selectedEdge = null;
    this.currentNode = null;
    this._draw();
  }

  /**
   * Sync the blocked state of a specific edge and redraw.
   * @param {string}  originId
   * @param {string}  destId
   * @param {boolean} isBlocked
   */
  updateEdgeState(originId, destId, isBlocked) {
    const edge = this.links.find(
      (l) => l.source === originId && l.target === destId,
    );
    if (edge) {
      edge.isBlocked = isBlocked;
      this._draw();
    }
  }

  /** Sync ALL edge blocked states from a fresh backend response. */
  syncBlockedRoutes(blockedList) {
    // blockedList: [{ origin, destination }]
    this.links.forEach((l) => {
      l.isBlocked = false;
    });
    blockedList.forEach(({ origin, destination }) => {
      const edge = this.links.find(
        (l) => l.source === origin && l.target === destination,
      );
      if (edge) edge.isBlocked = true;
    });
    this._draw();
  }

  /** Reset viewport to default. */
  resetView() {
    this._fitWorldToView();
    this._draw();
  }

  zoomIn() {
    this.zoom = Math.min(this.zoom * 1.2, 8.0);
    this._draw();
  }
  zoomOut() {
    this.zoom = Math.max(this.zoom / 1.2, 0.08);
    this._draw();
  }

  // ════════════════════════════════════════════════════════════
  // FORCE-DIRECTED SIMULATION
  // Layout algorithm: Coulomb repulsion + Hooke spring + gravity
  // Justification: no geographic coordinates in JSON → spring layout
  // is the clearest way to spread nodes while respecting connections.
  // ════════════════════════════════════════════════════════════

  _startSimulation() {
    this.simRunning = true;
    this.simTick = 0;
    this._simStep();
  }

  _simStep() {
    if (!this.simRunning) return;

    // Alpha decays from 0.25 → 0 over SIM_MAX_TICKS iterations
    const alpha = 0.25 * (1 - this.simTick / this.SIM_MAX_TICKS);

    if (alpha > 0.004) {
      this._applyForces(alpha);
      this.simTick++;
      this._draw();
      requestAnimationFrame(() => this._simStep());
    } else {
      this.simRunning = false;
      this._draw();
    }
  }

  /**
   * One simulation tick:
   * 1. Coulomb repulsion  → push all pairs of nodes apart
   * 2. Hooke attraction   → pull connected nodes toward ideal distance
   * 3. Center gravity     → keep everything from drifting off-screen
   * 4. Integrate + dampen
   *
   * @param {number} alpha - Current cooling factor (0…0.25)
   */
  _applyForces(alpha) {
    const { nodes, links, nodeMap, SIM_IDEAL_DIST } = this;
    const W = this.worldWidth;
    const H = this.worldHeight;

    // 1. Coulomb repulsion (O(n²) – acceptable for ≤60 nodes)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const repulsion = a.isHub && b.isHub ? 110000 : 76000;
        const rep = (repulsion / (d * d)) * alpha;
        a.vx -= (dx / d) * rep;
        a.vy -= (dy / d) * rep;
        b.vx += (dx / d) * rep;
        b.vy += (dy / d) * rep;
      }
    }

    // 2. Hooke spring attraction along edges (bidirectional effect)
    for (const link of links) {
      const s = nodeMap[link.source];
      const t = nodeMap[link.target];
      if (!s || !t) continue;
      const dx = t.x - s.x,
        dy = t.y - s.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const idealDist = SIM_IDEAL_DIST + (s.isHub || t.isHub ? 40 : 0);
      const f = (d - idealDist) * 0.04 * alpha;
      s.vx += (dx / d) * f;
      s.vy += (dy / d) * f;
      t.vx -= (dx / d) * f;
      t.vy -= (dy / d) * f;
    }

    // 3. Weak gravity toward canvas center
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * 0.009 * alpha;
      n.vy += (H / 2 - n.y) * 0.009 * alpha;
    }

    // 4. Integrate + damp + hard boundary clamp
    const DAMP = 0.72;
    for (const n of nodes) {
      n.vx *= DAMP;
      n.vy *= DAMP;
      n.x += n.vx;
      n.y += n.vy;
      const pad = n.radius + 48;
      n.x = Math.max(pad, Math.min(W - pad, n.x));
      n.y = Math.max(pad, Math.min(H - pad, n.y));
    }
  }

  // ════════════════════════════════════════════════════════════
  // DRAWING — main render pipeline
  // ════════════════════════════════════════════════════════════

  _draw() {
    const { ctx, canvas } = this;
    const W = canvas.width,
      H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, W, H);

    // Recompute perimeter-spread offsets every frame (nodes may have moved)
    this._spreadAngles = this._computeSpreadAngles();

    // Draw a subtle grid for context
    this._drawGrid(W, H);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Edges below nodes
    this._drawAllEdges();
    // Nodes on top
    this._drawAllNodes();
    // Flight animation ball (on top of everything, inside world transform)
    if (this._flightAnim?.active) this._drawFlightBall();

    ctx.restore();
  }

  /** Subtle background grid for spatial reference. */
  _drawGrid(W, H) {
    const ctx = this.ctx;
    const step = 40;
    ctx.strokeStyle = this.colors.gridLine;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x < W; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = 0; y < H; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
  }

  // ── EDGES ────────────────────────────────────────────────────

  _drawAllEdges() {
    for (const visualEdge of this._visualEdges()) {
      const { link, reverseLink, isBidirectional } = visualEdge;
      const s = this.nodeMap[link.source];
      const t = this.nodeMap[link.target];
      if (!s || !t) continue;

      const isBlocked = !!link.isBlocked || !!reverseLink?.isBlocked;
      const isInPath =
        this._edgeIsInPath(link.source, link.target) ||
        (reverseLink &&
          this._edgeIsInPath(reverseLink.source, reverseLink.target));
      const isSelected =
        this.selectedEdge &&
        ((this.selectedEdge.source === link.source &&
          this.selectedEdge.target === link.target) ||
          (reverseLink &&
            this.selectedEdge.source === reverseLink.source &&
            this.selectedEdge.target === reverseLink.target));

      let color;
      if (isBlocked) color = this.colors.edgeBlocked;
      else if (isInPath || isSelected) color = this.colors.edgeHighlight;
      else color = this.colors.edgeActive;

      this._drawEdge(
        s,
        t,
        color,
        visualEdge,
        isBlocked,
        isInPath || isSelected,
        isBidirectional,
      );
    }
  }

  /**
   * Draw a single directed edge: line + arrowhead(s) + distance label + aircraft dots.
   *
   * Bidirectional pairs → ONE straight line with arrowheads at BOTH ends.
   * Unidirectional      → curved line with arrowhead at target end only.
   *
   * Aircraft-type dots are drawn as a cluster BESIDE the source vertex,
   * offset perpendicularly to the edge so they sit next to the node circle
   * without overlapping the line itself.
   *
   * @param {GraphNode} s           - Source node
   * @param {GraphNode} t           - Target node
   * @param {string}    color       - Stroke color
   * @param {Object}    visualEdge  - Render-ready edge data
   * @param {boolean}   isBlocked   - Should show dashed blocked style?
   * @param {boolean}   isEmphasis  - Is selected or part of a highlighted path?
   * @param {boolean}   isBidirectional - Arrowheads at both ends?
   */
  _drawEdge(
    s,
    t,
    color,
    visualEdge,
    isBlocked,
    isEmphasis = false,
    isBidirectional = false,
  ) {
    const ctx = this.ctx;
    const ARROW = 13;
    const curve = this._edgeCurve(s, t, visualEdge, ARROW);
    if (!curve) return;
    const { sx, sy, cx, cy, ex, ey, nx, ny } = curve;

    // ── Line ──────────────────────────────────────────────────
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = isBlocked || isEmphasis ? 2.6 : 1.9;
    ctx.globalAlpha = isBlocked ? 0.85 : 1;
    if (isBlocked) ctx.setLineDash([8, 5]);
    else ctx.setLineDash([]);
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // ── Arrowhead at TARGET end ───────────────────────────────
    const tip = this._quadraticPoint(curve, 0.995);
    const tangent = this._quadraticTangent(curve, 0.995);
    const angle = Math.atan2(tangent.y, tangent.x);
    this._drawArrowHead(tip.x, tip.y, angle, ARROW, color);

    // ── Arrowhead at SOURCE end (bidirectional only) ──────────
    if (isBidirectional) {
      const startTip = this._quadraticPoint(curve, 0.005);
      const startTangent = this._quadraticTangent(curve, 0.005);
      // Reverse the angle so the arrowhead points AWAY from the source node
      const startAngle = Math.atan2(startTangent.y, startTangent.x) + Math.PI;
      this._drawArrowHead(startTip.x, startTip.y, startAngle, ARROW, color);
    }

    // ── Distance label (centered on edge) ────────────────────
    const labelText = this._visualEdgeLabel(visualEdge);
    if (this.zoom >= 0.42 || isBlocked || isEmphasis) {
      const label = this._quadraticPoint(curve, 0.54);
      const labelShift = Math.sign(curve.offset || 1) * 8;
      const labelX = label.x - ny * labelShift;
      const labelY = label.y + nx * labelShift;

      ctx.font = "bold 10px 'Segoe UI', sans-serif";
      const tw = ctx.measureText(labelText).width;

      // Pill background
      ctx.fillStyle = this.colors.edgeLabelBg;
      this._roundRect(ctx, labelX - tw / 2 - 5, labelY - 9, tw + 10, 18, 4);
      ctx.fill();

      // Label text
      ctx.fillStyle = isBlocked
        ? this.colors.edgeBlocked
        : this.colors.edgeLabelText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, labelX, labelY);
    }

    // Aircraft-type dots are drawn once per NODE (see _drawNodeAircraftDots),
    // not per edge, to avoid accumulation when a node has many connections.
  }

  _visualEdges() {
    const drawn = new Set();
    const visualEdges = [];

    for (const link of this.links) {
      const pairKey = this._edgePairKey(link.source, link.target);
      if (drawn.has(pairKey)) continue;

      const reverseLink = this.links.find(
        (other) => other.source === link.target && other.target === link.source,
      );
      const isBidirectional = !!reverseLink;
      const baseLink =
        isBidirectional && link.source > link.target ? reverseLink : link;
      const pairedReverse =
        isBidirectional && baseLink === link ? reverseLink : link;

      drawn.add(pairKey);
      visualEdges.push({
        ...baseLink,
        link: baseLink,
        reverseLink: isBidirectional ? pairedReverse : null,
        isBidirectional,
        aircrafts: this._mergeAircrafts(baseLink, pairedReverse),
      });
    }

    return visualEdges;
  }

  _edgePairKey(source, target) {
    return source < target ? `${source}|${target}` : `${target}|${source}`;
  }

  _mergeAircrafts(link, reverseLink) {
    const aircrafts = new Set(link.aircrafts || []);
    if (reverseLink) {
      (reverseLink.aircrafts || []).forEach((type) => aircrafts.add(type));
    }
    return [...aircrafts];
  }

  _visualEdgeLabel(visualEdge) {
    const reverse = visualEdge.reverseLink;
    if (!reverse || reverse.distance === visualEdge.distance) {
      return `${visualEdge.distance} km`;
    }
    return `${visualEdge.distance}/${reverse.distance} km`;
  }

  _drawArrowHead(x, y, angle, size, color) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.moveTo(x, y);
    ctx.lineTo(
      x - size * Math.cos(angle - 0.42),
      y - size * Math.sin(angle - 0.42),
    );
    ctx.lineTo(
      x - size * Math.cos(angle + 0.42),
      y - size * Math.sin(angle + 0.42),
    );
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Compute start/end points and control point for a quadratic edge curve.
   *
   * Connection points on each node's circle are determined by the edge's
   * natural direction PLUS a small angular offset from _computeSpreadAngles(),
   * so edges that would converge at the same spot on the perimeter are
   * fanned out and remain individually legible.
   */
  _edgeCurve(s, t, link, arrowSize = 13) {
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return null;

    // Look up pre-computed angular spread offsets for this edge
    const key = `${link.source}|${link.target}`;
    const spread = this._spreadAngles?.get(key);
    const srcOff = spread?.srcOff ?? 0;
    const tgtOff = spread?.tgtOff ?? 0;

    const baseAngle = Math.atan2(dy, dx);
    const nx = Math.cos(baseAngle);
    const ny = Math.sin(baseAngle);

    // Source connection point — rotated by srcOff around s
    const srcAngle = baseAngle + srcOff;
    const sx = s.x + Math.cos(srcAngle) * s.radius;
    const sy = s.y + Math.sin(srcAngle) * s.radius;

    // Target connection point — opposite side, rotated by tgtOff around t
    const tgtAngle = baseAngle + Math.PI + tgtOff;
    const ex = t.x + Math.cos(tgtAngle) * (t.radius + arrowSize - 2);
    const ey = t.y + Math.sin(tgtAngle) * (t.radius + arrowSize - 2);

    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const offset = this._edgeCurveOffset(link);

    return {
      sx,
      sy,
      cx: mx - ny * offset,
      cy: my + nx * offset,
      ex,
      ey,
      nx,
      ny,
      offset,
    };
  }

  /**
   * Compute the quadratic-curve bend offset for an edge.
   *
   * KEY CHANGE (v1.1): bidirectional visual edges use offset = 0 so they
   * render as a single straight line (no parallel double-curve).  The two
   * arrowheads at both ends make the direction unambiguous.
   *
   * Unidirectional edges keep a small stable curve to distinguish them
   * from bidirectional ones at a glance.
   */
  _edgeCurveOffset(link) {
    // ── Bidirectional pair → straight line, arrows at both ends ──
    if (link.isBidirectional) return 0;

    // ── Unidirectional → small stable curve ──────────────────────
    const pairLinks = this.links.filter(
      (l) =>
        (l.source === link.source && l.target === link.target) ||
        (l.source === link.target && l.target === link.source),
    );
    const sameDirection = pairLinks.filter(
      (l) => l.source === link.source && l.target === link.target,
    );
    const index = Math.max(0, sameDirection.indexOf(link));
    const directionSign = this._stableSign(`${link.source}->${link.target}`);
    const base = 18;
    const parallelOffset = index * 18;
    return directionSign * (base + parallelOffset);
  }

  _stableSign(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return hash < 0 ? -1 : 1;
  }

  _quadraticPoint(curve, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * curve.sx + 2 * mt * t * curve.cx + t * t * curve.ex,
      y: mt * mt * curve.sy + 2 * mt * t * curve.cy + t * t * curve.ey,
    };
  }

  _quadraticTangent(curve, t) {
    return {
      x: 2 * (1 - t) * (curve.cx - curve.sx) + 2 * t * (curve.ex - curve.cx),
      y: 2 * (1 - t) * (curve.cy - curve.sy) + 2 * t * (curve.ey - curve.cy),
    };
  }

  /** Returns a color associated with a given aircraft type string. */
  _aircraftColor(type) {
    if (type.includes("Comercial")) return this.colors.aircraftComercial;
    if (type.includes("Regional")) return this.colors.aircraftRegional;
    return this.colors.aircraftHelice; // Hélice
  }

  /** Returns true if the edge (src→tgt) belongs to the currently highlighted path. */
  _edgeIsInPath(src, tgt) {
    const p = this.highlightedPath;
    for (let i = 0; i < p.length - 1; i++) {
      if (p[i] === src && p[i + 1] === tgt) return true;
    }
    return false;
  }

  /**
   * Returns the transport-based color for a node in the highlighted path.
   * Uses the outgoing segment color; for the last node, falls back to the incoming segment.
   * Returns null if no segment data is available.
   */
  _nodeTransportColor(nodeId) {
    const path = this.highlightedPath;
    const segments = this.highlightedSegments;
    if (!segments.length) return null;

    const idx = path.indexOf(nodeId);
    if (idx === -1) return null;

    const seg =
      segments.find((s) => s.from === path[idx] && s.to === path[idx + 1]) ||
      segments.find((s) => s.from === path[idx - 1] && s.to === path[idx]);

    return seg?.transport ? this._aircraftColor(seg.transport) : null;
  }

  // ── NODES ────────────────────────────────────────────────────

  _drawAllNodes() {
    for (const node of this.nodes) this._drawNode(node);
  }

  /** Draw one airport node: circle + IATA code + city name. */
  _drawNode(node) {
    const ctx = this.ctx;
    const { x, y, radius, id, isHub, metadata } = node;

    const isSelected = this.selectedNode?.id === id;
    const isHovered = this.hoveredNode?.id === id;
    const isInPath = this.highlightedPath.includes(id);
    const isCurrentNode = this.currentNode === id;

    // Choose fill color by priority: selected > current > path > hovered > type
    let fill;
    if (isSelected) fill = this.colors.nodeSelected;
    else if (isCurrentNode) fill = this.colors.nodeCurrent;
    else if (isInPath)
      fill = this._nodeTransportColor(id) ?? this.colors.nodeInPath;
    else if (isHovered) fill = this.colors.nodeHover;
    else if (isHub) fill = this.colors.hub;
    else fill = this.colors.secondary;

    // ── Outer glow for selected / hovered / current ─────────
    if (isSelected || isHovered || isCurrentNode) {
      ctx.shadowColor = fill;
      ctx.shadowBlur = 20;
    }

    // Hub airports get an extra ring to make them stand out
    if (isHub && !isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = `${fill}55`; // translucent ring
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // ── Main circle ────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Border
    ctx.strokeStyle = isSelected ? "#065f46" : this.colors.nodeBorder;
    ctx.lineWidth = isHub ? 3 : 2;
    ctx.stroke();

    // ── IATA code ──────────────────────────────────────────
    const textY = isHub ? y - 7 : y - 5;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = this.colors.nodeText;
    ctx.font = `bold ${isHub ? 15 : 12}px 'Segoe UI', sans-serif`;
    ctx.fillText(id, x, textY);

    // ── City name (small, below IATA) ──────────────────────
    const city = metadata?.ciudad || "";
    if (city) {
      ctx.font = `${isHub ? 9 : 8}px 'Segoe UI', sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.fillText(city.slice(0, 10), x, textY + (isHub ? 13 : 10));
    }

    // ── Aircraft-type dots (once per node, below the circle) ──
    this._drawNodeAircraftDots(node);
  }

  /**
   * Draw aircraft-type indicator dots centered just below a node circle.
   *
   * Collects the UNIQUE aircraft types across ALL outgoing edges from this
   * node and renders one dot per type, so the indicator appears exactly
   * once per airport regardless of how many routes it has.
   *
   * Dot color legend:
   *   Purple → Comercial  |  Cyan → Regional  |  Amber → Hélice
   *
   * @param {GraphNode} node
   */
  _drawNodeAircraftDots(node) {
    const ctx = this.ctx;

    // Collect unique aircraft types from all outgoing links of this node
    const typeSet = new Set();
    for (const link of this.links) {
      if (link.source === node.id && Array.isArray(link.aircrafts)) {
        link.aircrafts.forEach((t) => typeSet.add(t));
      }
    }
    if (typeSet.size === 0) return;

    const types = [...typeSet]; // unique, stable order
    const DOT_R = 4;
    const GAP = 10; // center-to-center spacing

    // Center the row of dots below the node circle
    const totalW = (types.length - 1) * GAP;
    const startX = node.x - totalW / 2;
    const startY = node.y + node.radius + DOT_R + 5;

    types.forEach((type, i) => {
      ctx.beginPath();
      ctx.arc(startX + i * GAP, startY, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = this._aircraftColor(type);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  // ════════════════════════════════════════════════════════════
  // MOUSE INTERACTION
  // ════════════════════════════════════════════════════════════

  _initMouseEvents() {
    let dragging = false;
    let startX = 0,
      startY = 0;
    let clickMoved = false; // Distinguish click from drag

    // ── Mouse Down: begin drag ────────────────────────────────
    this.canvas.addEventListener("mousedown", (e) => {
      dragging = true;
      clickMoved = false;
      startX = e.clientX - this.panX;
      startY = e.clientY - this.panY;
      this.canvas.style.cursor = "grabbing";
    });

    // ── Mouse Move: drag pan + hover detection ────────────────
    this.canvas.addEventListener("mousemove", (e) => {
      if (dragging) {
        const dx = e.clientX - (startX + this.panX);
        const dy = e.clientY - (startY + this.panY);
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) clickMoved = true;
        this.panX = e.clientX - startX;
        this.panY = e.clientY - startY;
        this._draw();
      } else {
        // Hover detection for cursor change
        const { gx, gy } = this._screenToGraph(e.clientX, e.clientY);
        const hovered = this._nodeAt(gx, gy);
        if (hovered?.id !== this.hoveredNode?.id) {
          this.hoveredNode = hovered;
          this.canvas.style.cursor = hovered ? "pointer" : "grab";
          this._draw();
        }
      }
    });

    // ── Mouse Up: end drag, or fire click ────────────────────
    this.canvas.addEventListener("mouseup", (e) => {
      const wasDragging = dragging && clickMoved;
      dragging = false;
      this.canvas.style.cursor = this.hoveredNode ? "pointer" : "grab";

      if (wasDragging) return; // Was a pan, not a click

      const { gx, gy } = this._screenToGraph(e.clientX, e.clientY);

      // Priority: node click > edge click > deselect
      const node = this._nodeAt(gx, gy);
      if (node) {
        this.selectedNode = node;
        this.selectedEdge = null;
        this._draw();
        this.onNodeSelected?.(node);
        return;
      }

      const edge = this._edgeAt(gx, gy);
      if (edge) {
        this.selectedEdge = edge;
        this.selectedNode = null;
        this._draw();
        this.onEdgeSelected?.(edge);
        return;
      }

      // Clicked empty space → deselect
      this.selectedNode = null;
      this.selectedEdge = null;
      this._draw();
      this.onDeselect?.();
    });

    this.canvas.addEventListener("mouseleave", () => {
      dragging = false;
      this.hoveredNode = null;
      this.canvas.style.cursor = "grab";
      this._draw();
    });

    // ── Wheel: zoom ───────────────────────────────────────────
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        this.zoom = Math.max(0.08, Math.min(8, this.zoom * factor));
        this._draw();
      },
      { passive: false },
    );

    this.canvas.style.cursor = "grab";
  }

  // ── Hit testing ──────────────────────────────────────────────

  /**
   * Convert screen coordinates to graph-space coordinates
   * (accounting for pan and zoom).
   */
  _screenToGraph(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      gx: (sx - rect.left - this.panX) / this.zoom,
      gy: (sy - rect.top - this.panY) / this.zoom,
    };
  }

  /** Return the topmost node at graph coordinates (gx, gy), or null. */
  _nodeAt(gx, gy) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = gx - n.x,
        dy = gy - n.y;
      if (dx * dx + dy * dy <= n.radius * n.radius) return n;
    }
    return null;
  }

  /**
   * Return the edge whose curve is within `threshold` px of (gx, gy).
   * Samples the quadratic curve so hit testing matches rendered routes.
   */
  _edgeAt(gx, gy, threshold = 9) {
    for (const visualEdge of this._visualEdges()) {
      const link = visualEdge.link || visualEdge;
      const s = this.nodeMap[link.source];
      const t = this.nodeMap[link.target];
      if (!s || !t) continue;

      const curve = this._edgeCurve(s, t, visualEdge);
      if (!curve) continue;

      let prev = this._quadraticPoint(curve, 0);
      for (let i = 1; i <= 18; i++) {
        const curr = this._quadraticPoint(curve, i / 18);
        if (
          this._pointToSegmentDistanceSq(
            gx,
            gy,
            prev.x,
            prev.y,
            curr.x,
            curr.y,
          ) <=
          threshold * threshold
        ) {
          return link;
        }
        prev = curr;
      }
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════
  // UTILITIES
  // ════════════════════════════════════════════════════════════

  /**
   * For every visual edge compute small angular offsets (srcOff, tgtOff) so
   * that edges sharing a node are fanned evenly around its perimeter instead
   * of all exiting/entering at the same point.
   *
   * Returns a Map keyed by `${source}|${target}` → { srcOff, tgtOff }.
   */
  _computeSpreadAngles() {
    const map = new Map();
    const MIN_SEP = 0.35; // ~20° minimum gap between connection points
    const visualEdges = this._visualEdges();

    for (const node of this.nodes) {
      // Outgoing edges: this node is the visual-edge source
      const srcGroup = visualEdges
        .filter((ve) => ve.source === node.id)
        .map((ve) => {
          const t = this.nodeMap[ve.target];
          return t
            ? {
                key: `${ve.source}|${ve.target}`,
                nat: Math.atan2(t.y - node.y, t.x - node.x),
              }
            : null;
        })
        .filter(Boolean);

      // Incoming edges: this node is the visual-edge target
      const tgtGroup = visualEdges
        .filter((ve) => ve.target === node.id)
        .map((ve) => {
          const s = this.nodeMap[ve.source];
          return s
            ? {
                key: `${ve.source}|${ve.target}`,
                nat: Math.atan2(s.y - node.y, s.x - node.x),
              }
            : null;
        })
        .filter(Boolean);

      this._applyFan(srcGroup, MIN_SEP, map, "srcOff");
      this._applyFan(tgtGroup, MIN_SEP, map, "tgtOff");
    }

    return map;
  }

  /**
   * Spread a group of edges so no two adjacent angles are closer than minSep.
   * Uses iterative spring relaxation (push-apart) on sorted angles.
   * Writes `field` (srcOff or tgtOff) into `map` for each edge key.
   *
   * @param {{ key: string, nat: number }[]} group
   * @param {number} minSep  Minimum angular separation in radians
   * @param {Map}    map     Accumulator: key → { srcOff, tgtOff }
   * @param {string} field   'srcOff' or 'tgtOff'
   */
  _applyFan(group, minSep, map, field) {
    if (!group.length) return;

    // Sort by natural angle
    group = [...group].sort((a, b) => a.nat - b.nat);
    const angles = group.map((e) => e.nat);

    // Push adjacent pairs apart until all gaps ≥ minSep (max 60 passes)
    for (let pass = 0; pass < 60; pass++) {
      let changed = false;
      for (let i = 0; i < angles.length - 1; i++) {
        const gap = angles[i + 1] - angles[i];
        if (gap < minSep) {
          const push = (minSep - gap) / 2;
          angles[i] -= push;
          angles[i + 1] += push;
          changed = true;
        }
      }
      if (!changed) break;
    }

    group.forEach((e, i) => {
      const existing = map.get(e.key) ?? { srcOff: 0, tgtOff: 0 };
      map.set(e.key, { ...existing, [field]: angles[i] - e.nat });
    });
  }

  _pointToSegmentDistanceSq(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) {
      const ox = px - x1,
        oy = py - y1;
      return ox * ox + oy * oy;
    }
    const t = Math.max(
      0,
      Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2),
    );
    const cx = x1 + t * dx,
      cy = y1 + t * dy;
    const ox = px - cx,
      oy = py - cy;
    return ox * ox + oy * oy;
  }

  _configureWorld(nodeCount, linkCount) {
    const visibleW = this.canvas.width || 800;
    const visibleH = this.canvas.height || 600;
    const densityBoost = Math.min(
      1.3,
      Math.max(1, linkCount / Math.max(nodeCount * 1.8, 1)),
    );
    this.worldWidth = Math.max(
      visibleW * 2.6,
      nodeCount * 64 * densityBoost,
      2400,
    );
    this.worldHeight = Math.max(
      visibleH * 2.3,
      nodeCount * 40 * densityBoost,
      1400,
    );
  }

  _fitWorldToView() {
    const margin = 80;
    const zx = this.canvas.width / (this.worldWidth + margin);
    const zy = this.canvas.height / (this.worldHeight + margin);
    this.zoom = Math.max(0.16, Math.min(1, Math.min(zx, zy) * 0.96));
    this.panX = (this.canvas.width - this.worldWidth * this.zoom) / 2;
    this.panY = (this.canvas.height - this.worldHeight * this.zoom) / 2;
  }

  /** Resize canvas to fill its parent container. */
  _resize() {
    const container = this.canvas.parentElement;
    if (!container) return;
    this.canvas.width = container.clientWidth || 800;
    this.canvas.height = container.clientHeight || 600;
  }

  /**
   * Draw a rounded rectangle path (compatible with older browsers).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r
   */
  // ── FLIGHT ANIMATION ─────────────────────────────────────

  /**
   * Public entry point. Highlights the path and starts the animated ball
   * travelling segment by segment. preferredTransports is used to pick the
   * right aircraft colour when the optimize result doesn't carry per-segment
   * transport data.
   */
  animateFlight(path, preferredTransports = [], onComplete = null) {
    // Cancel any in-progress animation first
    if (this._flightAnim) this._flightAnim.active = false;

    // Build highlight segments (for node/edge colouring)
    const segsForHighlight = [];
    for (let i = 0; i < path.length - 1; i++) {
      const link = this.links.find(
        (l) => l.source === path[i] && l.target === path[i + 1],
      );
      if (!link) continue;
      const aircrafts = link.aircrafts || [];
      const candidates = preferredTransports.length
        ? aircrafts.filter((t) => preferredTransports.includes(t))
        : aircrafts;
      segsForHighlight.push({
        from: path[i],
        to: path[i + 1],
        transport: candidates[0] || aircrafts[0] || "",
      });
    }
    this.highlightPath(path, segsForHighlight);

    const segments = this._buildAnimationSegments(path, preferredTransports);
    if (!segments.length) {
      onComplete?.();
      return;
    }

    this._flightAnim = {
      segments,
      currentSeg: 0,
      segStartTime: null,
      currentT: 0,
      active: true,
      onComplete,
    };
    requestAnimationFrame((ts) => this._flightStep(ts));
  }

  _buildAnimationSegments(path, preferredTransports) {
    const segments = [];
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      const link = this.links.find((l) => l.source === from && l.target === to);
      if (!link) continue;

      const aircrafts = link.aircrafts || [];
      const candidates = preferredTransports.length
        ? aircrafts.filter((t) => preferredTransports.includes(t))
        : aircrafts;
      const transport = candidates[0] || aircrafts[0] || "Avión Comercial";

      // flightTime is stored in minutes; 1 simulated minute = 1 real second → × 1000 ms
      const flightMin =
        link.flightTime > 0 ? link.flightTime : (link.distance || 0) * 0.07;
      const durationMs = 20000; // minimum 0.5 s for very short segments

      segments.push({ from, to, transport, durationMs });
    }
    return segments;
  }

  _flightStep(timestamp) {
    const anim = this._flightAnim;
    if (!anim?.active) return;

    if (anim.segStartTime === null) anim.segStartTime = timestamp;

    const seg = anim.segments[anim.currentSeg];
    anim.currentT = Math.min(
      (timestamp - anim.segStartTime) / seg.durationMs,
      1,
    );

    this._draw(); // _drawFlightBall() is called inside _draw()

    if (anim.currentT >= 1) {
      anim.currentSeg++;
      anim.segStartTime = null;
      anim.currentT = 0;
      if (anim.currentSeg >= anim.segments.length) {
        anim.active = false;
        this._draw(); // final draw without ball
        anim.onComplete?.();
        return;
      }
    }
    requestAnimationFrame((ts) => this._flightStep(ts));
  }

  /**
 * Animate the plane travelling BACKWARDS along the segment it was flying.
 * The ball moves from its current position (startT) back to T=0 (origin).
 *
 * Why use the forward curve in reverse instead of the reverse edge?
 * → We want the ball to retrace the exact pixels it just crossed, which
 *   looks natural. Using a separate reverse edge would draw a different
 *   (parallel) curve, which would look wrong.
 *
 * @param {string}   from       - Origin IATA of the interrupted segment
 * @param {string}   to         - Destination IATA of the interrupted segment
 * @param {number}   [startT=1] - Current position along the curve (0–1)
 * @param {Function} [onComplete]
 */
  animateReturn(from, to, startT = 1.0, onComplete = null) {
    if (this._flightAnim) this._flightAnim.active = false;
  
    const link = this.links.find((l) => l.source === from && l.target === to);
    if (!link) {
      // Edge not found — skip animation and call complete immediately
      onComplete?.();
      return;
    }
  
    const flightMin  = link.flightTime > 0
      ? link.flightTime
      : (link.distance || 0) * 0.07;
    // Duration proportional to how far along the curve the plane already is
    const durationMs = 20000;
  
    this._flightAnim = {
      isReturn : true,
      from, to, link,
      startT,
      currentT : startT,   // counts DOWN to 0
      startTime: 0,
      durationMs,
      active   : true,
      onComplete,
    };
    requestAnimationFrame((ts) => this._returnStep(ts));
  }
  
  _returnStep(timestamp) {
    const anim = this._flightAnim;
    if (!anim?.active || !anim.isReturn) return;
  
    if (anim.startTime === null) anim.startTime = timestamp;
  
    const progress  = Math.min((timestamp - anim.startTime) / anim.durationMs, 1);
    anim.currentT   = anim.startT * (1 - progress); // startT → 0
  
    this._draw();
  
    if (progress >= 1) {
      anim.active        = false;
      this._flightAnim   = null;
      this._draw();
      anim.onComplete?.();
      return;
    }
    requestAnimationFrame((ts) => this._returnStep(ts));
  }

  _drawFlightBall() {
    const anim = this._flightAnim;
    if (!anim?.active) return;
  
    // ── Return animation (plane travels back to segment origin) ──
    if (anim.isReturn) {
      const sourceNode = this.nodeMap[anim.from];
      const targetNode = this.nodeMap[anim.to];
      if (!sourceNode || !targetNode) return;
  
      const curve = this._edgeCurve(sourceNode, targetNode, anim.link);
      if (!curve) return;
  
      const pos   = this._quadraticPoint(curve, anim.currentT);
      const tan   = this._quadraticTangent(curve, anim.currentT);
      // Add π so the arrow points BACKWARDS (returning to origin)
      const angle = Math.atan2(tan.y, tan.x) + Math.PI;
      this._drawBallAt(pos, angle, "#ef4444"); // red = emergency return
      return;
    }
  
    // ── Normal forward animation ─────────────────────────────────
    const seg        = anim.segments[anim.currentSeg];
    const t          = anim.currentT;
    const sourceNode = this.nodeMap[seg.from];
    const targetNode = this.nodeMap[seg.to];
    const link       = this.links.find(
      (l) => l.source === seg.from && l.target === seg.to,
    );
    if (!sourceNode || !targetNode || !link) return;
  
    const curve = this._edgeCurve(sourceNode, targetNode, link);
    if (!curve) return;
  
    const pos   = this._quadraticPoint(curve, t);
    const tan   = this._quadraticTangent(curve, t);
    const angle = Math.atan2(tan.y, tan.x);
    this._drawBallAt(pos, angle, this._aircraftColor(seg.transport));
  }

  /**
 * Draw the animated plane dot + directional arrow.
 * Shared by both the forward and the return animation.
 *
 * @param {{ x: number, y: number }} pos   - World-space position on the curve
 * @param {number}                   angle - Radians; the arrow points this way
 * @param {string}                   color - CSS colour for the dot and arrow
 */
  _drawBallAt(pos, angle, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
  
    // ── Dot ─────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth   = 2.5;
    ctx.stroke();
  
    // ── Directional arrow above the dot ─────────────────────────
    const arrowY = -20;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  
    ctx.beginPath();          // shaft
    ctx.moveTo(-7, arrowY);
    ctx.lineTo( 7, arrowY);
    ctx.stroke();
  
    ctx.beginPath();          // arrowhead
    ctx.moveTo(7, arrowY);
    ctx.lineTo(2, arrowY - 5);
    ctx.moveTo(7, arrowY);
    ctx.lineTo(2, arrowY + 5);
    ctx.stroke();
  
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

// CommonJS compatibility (test environments)
if (typeof module !== "undefined" && module.exports) {
  module.exports = GraphRenderer;
}
