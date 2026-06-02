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
 * @author  SkyRoute Team
 * @version 1.0
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
    this.HUB_RADIUS = 30;
    this.SECONDARY_RADIUS = 20;

    // ── Color palette (mirrors app.css CSS vars semantically) ─
    this.colors = {
      hub: "#ef4444", // Red   – Hub airports
      secondary: "#3b82f6", // Blue  – Secondary airports
      nodeSelected: "#10b981", // Green – Selected / active node
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

    // ── Graph data ────────────────────────────────────────────
    /** @type {Array<GraphNode>}  */ this.nodes = [];
    /** @type {Array<GraphEdge>}  */ this.links = [];
    /** @type {Object}            */ this.nodeMap = {}; // id → node

    // ── Interaction state ─────────────────────────────────────
    this.selectedNode = null;
    this.selectedEdge = null;
    this.hoveredNode = null;
    this.highlightedPath = []; // Array<string> of IATA codes

    // ── Force-directed simulation ─────────────────────────────
    this.simRunning = false;
    this.simTick = 0;
    this.SIM_MAX_TICKS = 500;
    this.SIM_IDEAL_DIST = 350; // Ideal spring length (px)

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
      if (this.nodes.length) this._draw();
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

    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    // Build internal node objects with random starting positions
    this.nodes = nodes.map((n) => ({
      id: n.id,
      label: n.label || n.id,
      isHub: !!n.isHub,
      metadata: n.metadata || {},
      x: cx + (Math.random() - 0.5) * Math.min(this.canvas.width * 0.8, 600),
      y: cy + (Math.random() - 0.5) * Math.min(this.canvas.height * 0.8, 400),
      vx: 0,
      vy: 0,
      radius: n.isHub ? this.HUB_RADIUS : this.SECONDARY_RADIUS,
    }));

    this.nodeMap = {};
    this.nodes.forEach((n) => {
      this.nodeMap[n.id] = n;
    });

    // Copy edge data as-is (source/target are IATA codes)
    this.links = links.map((l) => ({ ...l }));

    // Reset interaction
    this.selectedNode = null;
    this.selectedEdge = null;
    this.hoveredNode = null;
    this.highlightedPath = [];

    this._startSimulation();
  }

  /**
   * Highlight a sequence of IATA codes forming a route on the graph.
   * @param {string[]} nodeIds
   */
  highlightPath(nodeIds) {
    this.highlightedPath = Array.isArray(nodeIds) ? nodeIds : [];
    this._draw();
  }

  /** Clear all highlights and selections. */
  clearHighlight() {
    this.highlightedPath = [];
    this.selectedNode = null;
    this.selectedEdge = null;
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
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 20;
    this._draw();
  }

  zoomIn() {
    this.zoom = Math.min(this.zoom * 1.2, 8.0);
    this._draw();
  }
  zoomOut() {
    this.zoom = Math.max(this.zoom / 1.2, 0.12);
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
    const { nodes, links, nodeMap, canvas, SIM_IDEAL_DIST } = this;
    const W = canvas.width;
    const H = canvas.height;

    // 1. Coulomb repulsion (O(n²) – acceptable for ≤60 nodes)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const rep = (50000 / (d * d)) * alpha;
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
      const f = (d - SIM_IDEAL_DIST) * 0.045 * alpha;
      s.vx += (dx / d) * f;
      s.vy += (dy / d) * f;
      t.vx -= (dx / d) * f;
      t.vy -= (dy / d) * f;
    }

    // 3. Weak gravity toward canvas center
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * 0.012 * alpha;
      n.vy += (H / 2 - n.y) * 0.012 * alpha;
    }

    // 4. Integrate + damp + hard boundary clamp
    const DAMP = 0.72;
    for (const n of nodes) {
      n.vx *= DAMP;
      n.vy *= DAMP;
      n.x += n.vx;
      n.y += n.vy;
      const pad = n.radius + 24;
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

    // Draw a subtle grid for context
    this._drawGrid(W, H);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Edges below nodes
    this._drawAllEdges();
    // Nodes on top
    this._drawAllNodes();

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
    // Pre-compute which edges are bidirectional so we can offset them
    const bidirSet = new Set();
    for (const l of this.links) {
      if (
        this.links.some((r) => r.source === l.target && r.target === l.source)
      ) {
        bidirSet.add(`${l.source}→${l.target}`);
      }
    }

    for (const link of this.links) {
      const s = this.nodeMap[link.source];
      const t = this.nodeMap[link.target];
      if (!s || !t) continue;

      const isBidir = bidirSet.has(`${link.source}→${link.target}`);
      const isBlocked = !!link.isBlocked;
      const isInPath = this._edgeIsInPath(link.source, link.target);
      const isSelected =
        this.selectedEdge &&
        this.selectedEdge.source === link.source &&
        this.selectedEdge.target === link.target;

      let color;
      if (isBlocked) color = this.colors.edgeBlocked;
      else if (isInPath || isSelected) color = this.colors.edgeHighlight;
      else color = this.colors.edgeActive;

      this._drawEdge(s, t, color, link, isBidir, isBlocked);
    }
  }

  /**
   * Draw a single directed edge: line + arrowhead + distance label + aircraft dots.
   *
   * @param {GraphNode} s         - Source node
   * @param {GraphNode} t         - Target node
   * @param {string}    color     - Stroke color
   * @param {GraphEdge} link      - Edge data
   * @param {boolean}   bidir     - Is this part of a bidirectional pair?
   * @param {boolean}   isBlocked - Should show dashed blocked style?
   */
  _drawEdge(s, t, color, link, bidir, isBlocked) {
    const ctx = this.ctx;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return;

    const nx = dx / d,
      ny = dy / d; // Unit direction vector
    const PERP_OFFSET = bidir ? 10 : 0; // Perpendicular shift for bidirectional edges
    const px = -ny * PERP_OFFSET;
    const py = nx * PERP_OFFSET;

    // Edge starts at the circle boundary of the source node
    const ARROW = 13;
    const sx = s.x + nx * s.radius + px;
    const sy = s.y + ny * s.radius + py;
    const ex = t.x - nx * (t.radius + ARROW - 2) + px;
    const ey = t.y - ny * (t.radius + ARROW - 2) + py;

    // ── Line ──────────────────────────────────────────────────
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = isBlocked ? 2.5 : 2;
    ctx.globalAlpha = isBlocked ? 0.85 : 1;
    if (isBlocked) ctx.setLineDash([8, 5]);
    else ctx.setLineDash([]);
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // ── Arrow head ────────────────────────────────────────────
    const angle = Math.atan2(ey - sy, ex - sx);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.moveTo(ex, ey);
    ctx.lineTo(
      ex - ARROW * Math.cos(angle - 0.42),
      ey - ARROW * Math.sin(angle - 0.42),
    );
    ctx.lineTo(
      ex - ARROW * Math.cos(angle + 0.42),
      ey - ARROW * Math.sin(angle + 0.42),
    );
    ctx.closePath();
    ctx.fill();

    // ── Distance label (centered on edge) ────────────────────
    const midX = (sx + ex) / 2 + px * 0.5;
    const midY = (sy + ey) / 2 + py * 0.5;
    const labelText = `${link.distance} km`;

    ctx.font = "bold 10px 'Segoe UI', sans-serif";
    const tw = ctx.measureText(labelText).width;

    // Pill background
    ctx.fillStyle = this.colors.edgeLabelBg;
    this._roundRect(ctx, midX - tw / 2 - 5, midY - 9, tw + 10, 18, 4);
    ctx.fill();

    // Label text
    ctx.fillStyle = isBlocked
      ? this.colors.edgeBlocked
      : this.colors.edgeLabelText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, midX, midY);

    // ── Aircraft type dots (near source end of edge) ──────────
    const aircrafts = link.aircrafts || [];
    aircrafts.slice(0, 3).forEach((type, i) => {
      const dotT = 0.22 + i * 0.06; // Position along edge (0=source, 1=target)
      const dotX = sx + (ex - sx) * dotT;
      const dotY = sy + (ey - sy) * dotT;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
      ctx.fillStyle = this._aircraftColor(type);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
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

    // Choose fill color by priority: selected > path > hovered > type
    let fill;
    if (isSelected) fill = this.colors.nodeSelected;
    else if (isInPath) fill = this.colors.nodeInPath;
    else if (isHovered) fill = this.colors.nodeHover;
    else if (isHub) fill = this.colors.hub;
    else fill = this.colors.secondary;

    // ── Outer glow for selected / hovered ──────────────────
    if (isSelected || isHovered) {
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
    const textY = isHub ? y - 6 : y - 4;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = this.colors.nodeText;
    ctx.font = `bold ${isHub ? 13 : 11}px 'Segoe UI', sans-serif`;
    ctx.fillText(id, x, textY);

    // ── City name (small, below IATA) ──────────────────────
    const city = metadata?.ciudad || "";
    if (city) {
      ctx.font = `${isHub ? 8 : 7}px 'Segoe UI', sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.fillText(city.slice(0, 10), x, textY + (isHub ? 11 : 9));
    }
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
        this.zoom = Math.max(0.12, Math.min(8, this.zoom * factor));
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
   * Return the edge whose line segment is within `threshold` px of (gx, gy).
   * Uses point-to-segment distance formula.
   */
  _edgeAt(gx, gy, threshold = 9) {
    for (const link of this.links) {
      const s = this.nodeMap[link.source];
      const t = this.nodeMap[link.target];
      if (!s || !t) continue;
      const dx = t.x - s.x,
        dy = t.y - s.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      const tParam = Math.max(
        0,
        Math.min(1, ((gx - s.x) * dx + (gy - s.y) * dy) / len2),
      );
      const cx = s.x + tParam * dx,
        cy = s.y + tParam * dy;
      const edx = gx - cx,
        edy = gy - cy;
      if (edx * edx + edy * edy <= threshold * threshold) return link;
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════
  // UTILITIES
  // ════════════════════════════════════════════════════════════

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
