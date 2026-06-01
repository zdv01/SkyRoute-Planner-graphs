/**
 * graphLoadManager.js
 * Page-level controller for the SkyRoute Planner application.
 *
 * Responsibilities (R1):
 *  - Handle JSON file upload and trigger backend load
 *  - Initialize and wire GraphRenderer to the canvas
 *  - Render airport info panel on node click
 *  - Handle edge selection for route interruption
 *  - Populate airport selectors in all modals
 *  - Provide showToast / showLoading utilities used by all other modules
 *
 * Dependencies (must be loaded before this script):
 *   graphLoadService.js  → API functions
 *   graphRenderer.js     → GraphRenderer class
 *
 * @author  SkyRoute Team
 */

// ════════════════════════════════════════════════════════════
// MODULE STATE
// ════════════════════════════════════════════════════════════

/** @type {GraphRenderer|null} */
let renderer = null;

/** @type {{ nodes: Array, links: Array, config: Object }|null} */
let networkData = null;

/** Edge currently staged for blocking in the modal. */
let _pendingBlockEdge = null;

// ════════════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  // ── Graph renderer ──────────────────────────────────────
  try {
    renderer = new GraphRenderer("network-canvas");

    renderer.onNodeSelected = (node) => _onNodeSelected(node);
    renderer.onEdgeSelected = (edge) => _onEdgeSelected(edge);
    renderer.onDeselect = () => _onDeselect();
  } catch (err) {
    console.error("[graphLoadManager] Renderer init failed:", err);
  }

  // ── File upload ─────────────────────────────────────────
  document
    .getElementById("json-upload")
    ?.addEventListener("change", _handleFileUpload);

  // ── Canvas zoom / reset controls ────────────────────────
  document
    .getElementById("btn-zoom-in")
    ?.addEventListener("click", () => renderer?.zoomIn());
  document
    .getElementById("btn-zoom-out")
    ?.addEventListener("click", () => renderer?.zoomOut());
  document
    .getElementById("btn-reset-view")
    ?.addEventListener("click", () => renderer?.resetView());

  // ── Reset button (top-right header) ─────────────────────
  document.getElementById("btn-reset")?.addEventListener("click", _handleReset);

  // ── Toolbar: planning / interrupt buttons ────────────────
  document
    .getElementById("btn-planificacion-basica")
    ?.addEventListener("click", () =>
      _requireNetwork(() => {
        _populateAirportSelects();
        _openModal("modal-planificacion-basica");
      }),
    );

  document
    .getElementById("btn-planificacion-avanzada")
    ?.addEventListener("click", () =>
      _requireNetwork(() => {
        _populateAirportSelects();
        _openModal("modal-planificacion-avanzada");
      }),
    );

  document
    .getElementById("btn-interrumpir-ruta")
    ?.addEventListener("click", () =>
      _requireNetwork(() => {
        // Reset staged edge
        _pendingBlockEdge = null;
        _resetInterruptModal();
        _openModal("modal-interrumpir-ruta");
      }),
    );

  document
    .getElementById("btn-exportar-reporte")
    ?.addEventListener("click", () =>
      _requireNetwork(() => {
        _openModal("modal-actividades"); // placeholder — reportManager will override
      }),
    );

  document
    .getElementById("btn-configuracion")
    ?.addEventListener("click", () => _openModal("modal-configuracion"));

  // ── Modal close buttons (.btn-close and .btn-cancel) ────
  document
    .querySelectorAll(".btn-close, .btn-cancel")
    .forEach((btn) => btn.addEventListener("click", _closeAllModals));

  // ── Interruption: confirm block ──────────────────────────
  document
    .getElementById("btn-confirmar-bloqueo")
    ?.addEventListener("click", _handleConfirmBlock);

  // ── Configuration: save ──────────────────────────────────
  document
    .getElementById("btn-guardar-config")
    ?.addEventListener("click", _handleSaveConfig);

  document
    .getElementById("btn-restaurar-defaults")
    ?.addEventListener("click", _handleRestoreDefaults);

  // ── Clear itinerary ──────────────────────────────────────
  document
    .getElementById("btn-limpiar-itinerario")
    ?.addEventListener("click", () => {
      renderer?.clearHighlight();
      _setItineraryPanel(
        `<div class="empty-state"><p>No hay itinerario calculado</p></div>`,
      );
    });

  // ── Close modal when clicking the dark backdrop ──────────
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) _closeAllModals();
    });
  });
});

// ════════════════════════════════════════════════════════════
// FILE UPLOAD  (R1)
// ════════════════════════════════════════════════════════════

async function _handleFileUpload(e) {
  console.log("ENTRO A HANDLE FILE UPLOAD");
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = ""; // Allow re-selecting the same file

  // Validate JSON
  let jsonData;
  try {
    jsonData = JSON.parse(await file.text());
  } catch {
    showToast("El archivo seleccionado no es un JSON válido.", "error");
    return;
  }

  // Validate required keys
  if (!jsonData.nodos || !jsonData.aristas) {
    showToast('El JSON debe contener "nodos" y "aristas".', "error");
    return;
  }

  showLoading(true, "Construyendo la red aérea…");
  try {
    const response = await loadGraphFromJSON(jsonData);

    if (response.status !== "success") {
      throw new Error(response.message || "Error desconocido en el servidor");
    }

    networkData = response.data;

    // Show canvas and hide placeholder
    document.getElementById("canvas-placeholder")?.classList.add("hidden");

    // Render
    renderer.loadGraph(networkData);

    // Update toolbar counters
    _updateToolbarStats(networkData);

    showToast(
      `Red cargada: ${networkData.nodes.length} aeropuertos · ${networkData.links.length} rutas.`,
      "success",
    );
  } catch (err) {
    showToast(`Error al cargar: ${err.message}`, "error");
  } finally {
    showLoading(false);
  }
}

// ════════════════════════════════════════════════════════════
// GRAPH INTERACTION CALLBACKS
// ════════════════════════════════════════════════════════════

/** Called by GraphRenderer when the user clicks a node. */
function _onNodeSelected(node) {
  _renderAirportPanel(node);

  // If the interrupt modal is open, pre-fill the origin field
  const modal = document.getElementById("modal-interrumpir-ruta");
  if (modal?.classList.contains("active") && _pendingBlockEdge === null) {
    // First selection: set as origin of edge to block (user must click another)
    showToast(`Selecciona la arista que quieres bloquear en el mapa.`, "info");
  }
}

/** Called by GraphRenderer when the user clicks an edge. */
function _onEdgeSelected(edge) {
  _pendingBlockEdge = edge;

  const btn = document.getElementById("btn-confirmar-bloqueo");
  const info = document.getElementById("ruta-seleccionada-info");

  if (info) {
    const aircraft = (edge.aircrafts || []).join(", ") || "-";
    info.className = "alert alert-info";
    info.innerHTML = `
      <strong>${edge.source} → ${edge.target}</strong><br>
      Distancia: ${edge.distance} km · ${aircraft}
    `;
  }
  if (btn) btn.disabled = false;
}

/** Called by GraphRenderer when user clicks on empty space. */
function _onDeselect() {
  // Nothing to do at this level; submodules can hook their own logic here
}

// ════════════════════════════════════════════════════════════
// AIRPORT INFO PANEL  (R1)
// ════════════════════════════════════════════════════════════

/** Render the left-panel info card for the selected airport node. */
function _renderAirportPanel(node) {
  const container = document.getElementById("airport-info");
  if (!container) return;

  const m = node.metadata || {};
  const routes = (networkData?.links || []).filter((l) => l.source === node.id);
  const incoming = (networkData?.links || []).filter(
    (l) => l.target === node.id,
  );

  // Collect unique aircraft types for all outgoing routes
  const aircraftSet = new Set(routes.flatMap((r) => r.aircrafts || []));

  // Build activities summary
  const activities = m.actividades || [];
  const jobs = m.trabajos || [];

  container.innerHTML = `
    <div class="airport-detail">
      <div class="airport-name">${m.AEROPUERTO || node.label}</div>
      <div class="airport-code">
        <span style="font-family:monospace;font-weight:700;font-size:1.1rem;">${node.id}</span>
        &nbsp;·&nbsp;
        ${
          node.isHub
            ? '<span style="color:#ef4444;font-weight:700;">✈ Hub</span>'
            : '<span style="color:#3b82f6;">Secundario</span>'
        }
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

    ${
      aircraftSet.size
        ? `<div class="info-row">
             <span class="info-label">Aeronaves</span>
             <span class="info-value" style="font-size:0.78rem;line-height:1.5;">
               ${[...aircraftSet].join("<br>")}
             </span>
           </div>`
        : ""
    }

    ${
      activities.length
        ? `<div class="info-row">
             <span class="info-label">Actividades</span>
             <span class="info-value">${activities.length} disponibles</span>
           </div>`
        : ""
    }

    ${
      jobs.length
        ? `<div class="info-row">
             <span class="info-label">Trabajos disp.</span>
             <span class="info-value">${jobs.length} trabajos</span>
           </div>`
        : ""
    }
  `;
}

// ════════════════════════════════════════════════════════════
// ROUTE INTERRUPTION  (R4)
// ════════════════════════════════════════════════════════════

async function _handleConfirmBlock() {
  if (!_pendingBlockEdge) return;

  const reason = document.getElementById("motivo-bloqueo")?.value || "Otro";
  const { source, target } = _pendingBlockEdge;

  showLoading(true, `Bloqueando ${source} → ${target}…`);
  try {
    await blockRoute(source, target, reason);

    // Update renderer so the edge turns red/dashed immediately
    renderer.updateEdgeState(source, target, true);

    showToast(`Ruta ${source} → ${target} bloqueada.`, "success");
    _closeAllModals();
    _resetInterruptModal();
  } catch (err) {
    showToast(`Error al bloquear: ${err.message}`, "error");
  } finally {
    showLoading(false);
  }
}

function _resetInterruptModal() {
  _pendingBlockEdge = null;
  const info = document.getElementById("ruta-seleccionada-info");
  if (info) {
    info.className = "alert alert-warning";
    info.textContent = "Ninguna ruta seleccionada";
  }
  const btn = document.getElementById("btn-confirmar-bloqueo");
  if (btn) btn.disabled = true;
}

// ════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════

function _handleSaveConfig() {
  // Read values — other modules (routePerformanceManager) will pick these up
  const config = _readConfigForm();
  window._skyRouteConfig = config;
  showToast("Configuración guardada.", "success");
  _closeAllModals();
}

function _handleRestoreDefaults() {
  document.getElementById("costo-comercial").value = "0.18";
  document.getElementById("tiempo-comercial").value = "0.7";
  document.getElementById("costo-regional").value = "0.25";
  document.getElementById("tiempo-regional").value = "1.1";
  document.getElementById("costo-helice").value = "0.12";
  document.getElementById("tiempo-helice").value = "2.5";
  document.getElementById("intervalo-alojamiento").value = "20";
  document.getElementById("intervalo-alimentacion").value = "8";
  document.getElementById("umbral-trabajo").value = "35";
  showToast("Valores restaurados a los predeterminados.", "info");
}

function _readConfigForm() {
  return {
    aeronaves: {
      "Avión Comercial": {
        costoKm: parseFloat(
          document.getElementById("costo-comercial")?.value || 0.18,
        ),
        tiempoKm: parseFloat(
          document.getElementById("tiempo-comercial")?.value || 0.7,
        ),
      },
      "Avión Regional": {
        costoKm: parseFloat(
          document.getElementById("costo-regional")?.value || 0.25,
        ),
        tiempoKm: parseFloat(
          document.getElementById("tiempo-regional")?.value || 1.1,
        ),
      },
      Hélice: {
        costoKm: parseFloat(
          document.getElementById("costo-helice")?.value || 0.12,
        ),
        tiempoKm: parseFloat(
          document.getElementById("tiempo-helice")?.value || 2.5,
        ),
      },
    },
    intervaloAlojamiento: parseInt(
      document.getElementById("intervalo-alojamiento")?.value || 20,
    ),
    intervaloAlimentacion: parseInt(
      document.getElementById("intervalo-alimentacion")?.value || 8,
    ),
    presupuestoMinimoPorc: parseInt(
      document.getElementById("umbral-trabajo")?.value || 35,
    ),
  };
}

// ════════════════════════════════════════════════════════════
// MODAL HELPERS
// ════════════════════════════════════════════════════════════

function _openModal(id) {
  document.getElementById(id)?.classList.add("active");
}

function _closeAllModals() {
  document
    .querySelectorAll(".modal.active")
    .forEach((m) => m.classList.remove("active"));
}

/**
 * Populate all <select> elements that list airports with current network nodes.
 * Called whenever a planning modal is opened.
 */
function _populateAirportSelects() {
  if (!networkData) return;

  const selectIds = ["origen-basico", "destino-basico", "origen-avanzado"];

  selectIds.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;

    const current = sel.value; // Preserve current selection if any
    sel.innerHTML = '<option value="">Seleccione aeropuerto...</option>';

    networkData.nodes.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n.id;
      opt.textContent = `${n.id} – ${n.metadata?.ciudad || n.id}${n.isHub ? " ★" : ""}`;
      sel.appendChild(opt);
    });

    if (current) sel.value = current;
  });
}

// ════════════════════════════════════════════════════════════
// TOOLBAR & STATUS
// ════════════════════════════════════════════════════════════

function _updateToolbarStats(data) {
  const blocked = (data.links || []).filter((l) => l.isBlocked).length;

  _setText("estado-sistema", "Red cargada ✓");
  _setText("total-aeropuertos", data.nodes.length);
  _setText(
    "total-rutas",
    `${data.links.length - blocked} activas · ${blocked} bloqueadas`,
  );
}

// ════════════════════════════════════════════════════════════
// RESET
// ════════════════════════════════════════════════════════════

function _handleReset() {
  if (!networkData && !renderer) return;

  renderer?.clearHighlight();
  networkData = null;
  _pendingBlockEdge = null;

  document.getElementById("canvas-placeholder")?.classList.remove("hidden");

  _setAirportPanel(
    `<div class="empty-state"><p>Haz clic en un aeropuerto en el mapa para ver su información</p></div>`,
  );
  _setItineraryPanel(
    `<div class="empty-state"><p>No hay itinerario calculado</p></div>`,
  );

  _setText("estado-sistema", "Sin datos");
  _setText("total-aeropuertos", "0");
  _setText("total-rutas", "0");

  document.getElementById("journey-summary").style.display = "none";
  document.getElementById("final-report").style.display = "none";

  showToast("Sistema reiniciado.", "info");
}

// ════════════════════════════════════════════════════════════
// EXPORTED UTILITIES  (used by routePerformanceManager, etc.)
// ════════════════════════════════════════════════════════════

/**
 * Show or hide the full-screen loading overlay.
 * @param {boolean} visible
 * @param {string}  [text]
 */
function showLoading(visible, text = "Procesando…") {
  const overlay = document.getElementById("loading-overlay");
  const label = document.getElementById("loading-text");
  if (!overlay) return;
  overlay.classList.toggle("active", visible);
  if (label && text) label.textContent = text;
}

/**
 * Display a temporary toast notification.
 * @param {string} message
 * @param {"success"|"error"|"warning"|"info"} [type]
 * @param {number} [duration]
 */
function showToast(message, type = "info", duration = 3500) {
  const icons = { success: "✓", error: "✗", warning: "⚠", info: "ℹ" };
  const toast = document.createElement("div");
  toast.className = `sky-toast ${type}`;
  toast.innerHTML = `
    <span class="sky-toast-icon">${icons[type] ?? "ℹ"}</span>
    <span class="sky-toast-message">${message}</span>
    <button class="sky-toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.style.cssText =
      "position:fixed;top:90px;right:20px;z-index:2000;display:flex;flex-direction:column;gap:10px;max-width:360px;";
    document.body.appendChild(container);
  }

  container.appendChild(toast);
  setTimeout(() => toast?.remove(), duration);
}

/**
 * Set inner HTML of the airport info left panel.
 * @param {string} html
 */
function _setAirportPanel(html) {
  const el = document.getElementById("airport-info");
  if (el) el.innerHTML = html;
}

/**
 * Set inner HTML of the itinerary left panel.
 * @param {string} html
 */
function _setItineraryPanel(html) {
  const el = document.getElementById("itinerary-info");
  if (el) el.innerHTML = html;
}

/** Shorthand: set textContent of an element by ID. */
function _setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * Guard: show a warning toast if no network is loaded, otherwise run callback.
 * @param {Function} fn
 */
function _requireNetwork(fn) {
  if (!networkData) {
    showToast("Primero carga una red aérea (JSON).", "warning");
    return;
  }
  fn();
}
