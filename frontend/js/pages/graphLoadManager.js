/**
 * graphLoadManager.js — R1: Graph load and visualisation ONLY
 *
 * Responsibilities:
 *  - Initialise GraphRenderer on the canvas
 *  - Handle JSON file upload → backend call → draw graph
 *  - Render the airport info panel when a node is clicked
 *  - Zoom in / out / reset-view controls
 *  - System reset button
 *  - Toolbar stats (airport count, route count)
 *  - Global modal behaviour (backdrop + .btn-close)
 *
 * Bridge to other managers — Custom DOM Events fired on document:
 *   "skyroute:networkLoaded"  detail: { nodes, links, config }
 *   "skyroute:networkReset"   (no detail)
 *   "skyroute:nodeSelected"   detail: node
 *   "skyroute:edgeSelected"   detail: edge
 *   "skyroute:deselect"       (no detail)
 *
 * @author  SkyRoute Team
 */
import { GraphRenderer } from "../models/graphRenderer.js";
import { loadGraphFromJson } from "../services/graphLoadService.js";
import {
  showToast2,
  showLoading,
  initModalBehavior,
} from "../../utils/utils.js";

// ════════════════════════════════════════════════════════════
// Module state
// ════════════════════════════════════════════════════════════

/** @type {GraphRenderer|null} */
let renderer = null;

/** @type {{ nodes: Array, links: Array, config: Object }|null} */
let networkData = null;

// ════════════════════════════════════════════════════════════
// Initialisation
// ════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {

  // ── Renderer ────────────────────────────────────────────
  try {
    renderer = new GraphRenderer("network-canvas");

    renderer.onNodeSelected = (node) => {
      _renderAirportPanel(node);
      document.dispatchEvent(
        new CustomEvent("skyroute:nodeSelected", { detail: node })
      );
    };

    renderer.onEdgeSelected = (edge) => {
      document.dispatchEvent(
        new CustomEvent("skyroute:edgeSelected", { detail: edge })
      );
    };

    renderer.onDeselect = () => {
      document.dispatchEvent(new CustomEvent("skyroute:deselect"));
    };

  } catch (err) {
    console.error("[graphLoadManager] Renderer init failed:", err);
  }

  // ── JSON file upload ─────────────────────────────────────
  document
    .getElementById("json-upload")
    ?.addEventListener("change", _handleFileUpload);

  // ── Canvas controls ──────────────────────────────────────
  document
    .getElementById("btn-zoom-in")
    ?.addEventListener("click", () => renderer?.zoomIn());
  document
    .getElementById("btn-zoom-out")
    ?.addEventListener("click", () => renderer?.zoomOut());
  document
    .getElementById("btn-reset-view")
    ?.addEventListener("click", () => renderer?.resetView());

  // ── System reset ─────────────────────────────────────────
  document
    .getElementById("btn-reset")
    ?.addEventListener("click", _handleReset);

  // ── Clear highlighted itinerary path ────────────────────
  document
    .getElementById("btn-limpiar-itinerario")
    ?.addEventListener("click", () => {
      renderer?.clearHighlight();
      _setItineraryPanel(
        `<div class="empty-state"><p>No hay itinerario calculado</p></div>`
      );
    });

  // ── Global modal close behaviour ─────────────────────────
  initModalBehavior();
});

// ════════════════════════════════════════════════════════════
// R1 — File upload and graph rendering
// ════════════════════════════════════════════════════════════

async function _handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = "";

  let jsonData;
  try {
    jsonData = JSON.parse(await file.text());
  } catch {
    showToast2("El archivo seleccionado no es un JSON válido.", "error");
    return;
  }

  if (!jsonData.nodos || !jsonData.aristas) {
    showToast2('El JSON debe contener "nodos" y "aristas".', "error");
    return;
  }

  showLoading(true, "Construyendo la red aérea…");
  try {
    const response = await loadGraphFromJson(jsonData);

    if (response.status !== "success") {
      throw new Error(response.message || "Error desconocido en el servidor");
    }

    networkData = response.data;

    document.getElementById("canvas-placeholder")?.classList.add("hidden");
    renderer.loadGraph(networkData);
    _updateToolbarStats(networkData);

    document.dispatchEvent(
      new CustomEvent("skyroute:networkLoaded", { detail: networkData })
    );

    showToast2(
      `Red cargada: ${networkData.nodes.length} aeropuertos · ${networkData.links.length} rutas.`,
      "success"
    );
  } catch (err) {
    showToast2(`Error al cargar: ${err.message}`, "error");
  } finally {
    showLoading(false);
  }
}

// ════════════════════════════════════════════════════════════
// R1 — Airport info panel
// ════════════════════════════════════════════════════════════

function _renderAirportPanel(node) {
  const container = document.getElementById("airport-info");
  if (!container) return;

  const m        = node.metadata || {};
  const routes   = (networkData?.links || []).filter((l) => l.source === node.id);
  const incoming = (networkData?.links || []).filter((l) => l.target === node.id);
  const aircraftSet = new Set(routes.flatMap((r) => r.aircrafts || []));
  const activities  = m.actividades || [];
  const jobs        = m.trabajos    || [];

  container.innerHTML = `
    <div class="airport-detail">
      <div class="airport-name">${m.AEROPUERTO || node.label}</div>
      <div class="airport-code">
        <span style="font-family:monospace;font-weight:700;font-size:1.1rem;">${node.id}</span>
        &nbsp;·&nbsp;
        ${node.isHub
          ? '<span style="color:#ef4444;font-weight:700;">✈ Hub</span>'
          : '<span style="color:#3b82f6;">Secundario</span>'}
      </div>
    </div>
    <div class="info-row">
      <span class="info-label">Ciudad</span>
      <span class="info-value">${m.ciudad || "-"}</span>
    </div>
    <div class="info-row">
      <span class="info-label">País</span>
      <span class="info-value">${m.pais || "-"}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Zona Horaria</span>
      <span class="info-value">${m.zonaHoraria || "-"}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Alojamiento</span>
      <span class="info-value">$${m.costoAlojamiento ?? "-"} / noche</span>
    </div>
    <div class="info-row">
      <span class="info-label">Alimentación</span>
      <span class="info-value">$${m.costoAlimentacion ?? "-"} / comida</span>
    </div>
    <div class="info-row">
      <span class="info-label">Rutas salientes</span>
      <span class="info-value">${routes.length}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Rutas entrantes</span>
      <span class="info-value">${incoming.length}</span>
    </div>
    ${aircraftSet.size ? `
    <div class="info-row">
      <span class="info-label">Aeronaves</span>
      <span class="info-value" style="font-size:0.78rem;line-height:1.5;">
        ${[...aircraftSet].join("<br>")}
      </span>
    </div>` : ""}
    ${activities.length ? `
    <div class="info-row">
      <span class="info-label">Actividades</span>
      <span class="info-value">${activities.length} disponibles</span>
    </div>` : ""}
    ${jobs.length ? `
    <div class="info-row">
      <span class="info-label">Trabajos disp.</span>
      <span class="info-value">${jobs.length} trabajos</span>
    </div>` : ""}
  `;
}

// ════════════════════════════════════════════════════════════
// System reset
// ════════════════════════════════════════════════════════════

function _handleReset() {
  renderer?.clearHighlight();
  networkData = null;

  document.getElementById("canvas-placeholder")?.classList.remove("hidden");

  _setAirportPanel(
    `<div class="empty-state"><p>Haz clic en un aeropuerto en el mapa para ver su información</p></div>`
  );
  _setItineraryPanel(
    `<div class="empty-state"><p>No hay itinerario calculado</p></div>`
  );

  _setText("estado-sistema",    "Sin datos");
  _setText("total-aeropuertos", "0");
  _setText("total-rutas",       "0");

  const js = document.getElementById("journey-summary");
  const fr = document.getElementById("final-report");
  if (js) js.style.display = "none";
  if (fr) fr.style.display = "none";

  document.dispatchEvent(new CustomEvent("skyroute:networkReset"));
  showToast2("Sistema reiniciado.", "info");
}

// ════════════════════════════════════════════════════════════
// Internal helpers
// ════════════════════════════════════════════════════════════

function _updateToolbarStats(data) {
  const blocked = (data.links || []).filter((l) => l.isBlocked).length;
  _setText("estado-sistema",    "Red cargada ✓");
  _setText("total-aeropuertos", data.nodes.length);
  _setText("total-rutas", `${data.links.length - blocked} activas · ${blocked} bloqueadas`);
}

function _setAirportPanel(html) {
  const el = document.getElementById("airport-info");
  if (el) el.innerHTML = html;
}

function _setItineraryPanel(html) {
  const el = document.getElementById("itinerary-info");
  if (el) el.innerHTML = html;
}

function _setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════

export function getRenderer()    { return renderer; }
export function getNetworkData() { return networkData; }

export function requireNetwork(fn) {
  if (!networkData) {
    showToast2("Primero carga una red aérea (JSON).", "warning");
    return;
  }
  fn();
}

export { showLoading } from "../../utils/utils.js";