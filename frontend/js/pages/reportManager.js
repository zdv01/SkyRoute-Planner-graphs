/**
 * reportManager.js — R5: Final Travel Report Export
 *
 * Responsibilities:
 * - Handles the "Export Report" toolbar button and opens the report modal.
 * - Reads travel history from window._skyRouteLastTravelState.
 * (Populated by dynamicTravelManager when a journey ends or a snapshot is created.)
 * - Builds a structured report containing all required sections:
 * - Visited Destinations
 * - Flight Segments
 * - Completed Activities
 * - Completed Jobs
 * - Summary Totals
 * - Sends the report payload to /api/report/generate for backend persistence.
 * - Renders the report inside a modal without emojis.
 * - Highlights the complete travel path on the graph canvas.
 */

import { generateReport } from "../services/reportService.js";
import {
  getRenderer,
  getNetworkData,
  requireNetwork,
} from "./graphLoadManager.js";
import {
  showToast2,
  showLoading,
  openModal,
  closeAllModals,
} from "../../utils/utils.js";

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("btn-exportar-reporte")
    ?.addEventListener("click", () => requireNetwork(_handleExportReport));

  // Triggered by dynamicTravelManager when _endJourney() is executed
  document.addEventListener("skyroute:journeyEnded", (e) => {
    window._skyRouteLastTravelState = e.detail?.state ?? null;
  });

  // Also accept journey snapshots while the trip is still in progress
  document.addEventListener("skyroute:journeySnapshot", (e) => {
    window._skyRouteLastTravelState = e.detail?.state ?? null;
  });
});

// ============================================================================
// Main Export Handler
// ============================================================================

/**
 * Handles the export report process. Validates travel state, builds the payload,
 * sends it to the backend, highlights the path, and renders the modal.
 */
async function _handleExportReport() {
  const state = window._skyRouteLastTravelState ?? null;

  if (!state) {
    showToast2(
      "No se ha registrado ningún viaje. Inicie una sesión de Planificación Avanzada primero.",
      "warning",
      5000,
    );
    return;
  }

  showLoading(true, "Generando reporte...");

  const networkData = getNetworkData();
  const nodeMap = {};
  (networkData?.nodes ?? []).forEach((n) => (nodeMap[n.id] = n));

  const reportPayload = _buildReportPayload(state, nodeMap, networkData);

  // Send the report to the backend (failure is non-critical)
  // Note: Payload keys are kept in original Spanish to avoid breaking backend expectations.
  try {
    await generateReport({
      destinosVisitados: reportPayload.destinosVisitados,
      vuelosRecorridos: reportPayload.vuelosRecorridos,
      actividadesRealizadas: reportPayload.actividadesRealizadas,
      trabajosRealizados: reportPayload.trabajosRealizados,
      totales: reportPayload.totales,
    });
  } catch (err) {
    console.warn("[reportManager] Backend report call failed:", err.message);
  }

  showLoading(false);

  // Highlight the complete travel path on the graph canvas
  const allNodes = [...(state.visited ?? []), state.current_node].filter(
    Boolean,
  );
  if (allNodes.length > 1) {
    const segments = _buildSegmentsFromHistory(state.history ?? []);
    getRenderer()?.highlightPath(allNodes, segments);
  }

  _renderReportModal(reportPayload, state);
  openModal("modal-reporte");
  showToast2("Reporte generado con éxito.", "success");
}

// ============================================================================
// Report Payload Builder
// ============================================================================

/**
 * Parses the travel history state and extracts all required data metrics.
 * @param {Object} state - The current travel state.
 * @param {Object} nodeMap - A dictionary mapping node IDs to node data.
 * @param {Object} networkData - The overall network data including links.
 * @returns {Object} The structured report payload.
 */
function _buildReportPayload(state, nodeMap, networkData) {
  const history = state.history ?? [];
  const visited = [...(state.visited ?? []), state.current_node].filter(
    Boolean,
  );
  const links = networkData?.links ?? [];

  // ── Visited Destinations ──────────────────────────────────
  const destinosVisitados = visited.map((id) => {
    const meta = nodeMap[id]?.metadata ?? {};

    // Total expenses associated with this destination
    // (activities, jobs, accommodation, and local costs)
    const costsHere = history
      .filter((h) => (h.location === id || h.to === id) && h.type !== "flight")
      .reduce((acc, h) => acc + (h.cost ?? 0), 0);

    return {
      id,
      nombreAeropuerto: meta.AEROPUERTO ?? id,
      ciudad: meta.ciudad ?? "—",
      pais: meta.pais ?? "—",
      zonaHoraria: meta.zonaHoraria ?? "—",
      esHub: meta.esHub ?? false,
      costoAlojamiento: meta.costoAlojamiento ?? 0,
      costoAlimentacion: meta.costoAlimentacion ?? 0,
      costoTotal: Math.round(costsHere * 100) / 100,
    };
  });

  // ── Flight Segments ───────────────────────────────────────
  const vuelosRecorridos = history
    .filter((h) => h.type === "flight")
    .map((h) => {
      const link =
        links.find((l) => l.source === h.from && l.target === h.to) ?? {};

      return {
        origen: h.from,
        destino: h.to,
        aeronave: h.aircraft ?? "—",
        distanciaKm: link.distance ?? 0,
        tiempoVuelo: Math.round(h.time_mins ?? 0),
        costoTramo: Math.round((h.cost ?? 0) * 100) / 100,
        subsidiado: link.routeSubsidized ?? false,
      };
    });

  // ── Completed Activities ──────────────────────────────────
  const actividadesRealizadas = history
    .filter((h) => h.type === "activity")
    .map((h) => ({
      nombre: h.name ?? "—",
      tipo: "opcional",
      ubicacion: h.location ?? "—",
      duracion: h.time_mins ?? 0,
      costoUSD: Math.round((h.cost ?? 0) * 100) / 100,
    }));

  // ── Completed Jobs ────────────────────────────────────────
  const trabajosRealizados = history
    .filter((h) => h.type === "job")
    .map((h) => ({
      nombre: h.name ?? "—",
      ubicacion: h.location ?? "—",
      horasTrabajadas: h.hours ?? 0,
      ingresoObtenido: Math.round((h.earned ?? 0) * 100) / 100,
    }));

  // ── Summary Totals ────────────────────────────────────────
  const totalGastado = history
    .filter((h) => h.type !== "job")
    .reduce((acc, h) => acc + (h.cost ?? 0), 0);

  const totalGanado = history
    .filter((h) => h.type === "job")
    .reduce((acc, h) => acc + (h.earned ?? 0), 0);

  const totales = {
    presupuestoInicial: state.initial_budget ?? 0,
    totalGastado: Math.round(totalGastado * 100) / 100,
    totalGanado: Math.round(totalGanado * 100) / 100,
    saldoFinal: Math.round((state.current_budget ?? 0) * 100) / 100,
    tiempoTotalMinutos: Math.round(state.total_time_mins ?? 0),
    tiempoTotalHoras:
      Math.round(((state.total_time_mins ?? 0) / 60) * 100) / 100,
    destinosVisitados: (state.visited ?? []).length,
    vuelosRealizados: vuelosRecorridos.length,
    actividadesRealizadas: actividadesRealizadas.length,
    trabajosRealizados: trabajosRealizados.length,
  };

  return {
    destinosVisitados,
    vuelosRecorridos,
    actividadesRealizadas,
    trabajosRealizados,
    totales,
  };
}

/**
 * Helper to build visual segments for canvas highlighting from travel history.
 * @param {Array} history - Array of historic travel events.
 * @returns {Array} List of formatted segment objects.
 */
function _buildSegmentsFromHistory(history) {
  return history
    .filter((h) => h.type === "flight")
    .map((h) => ({
      from: h.from,
      to: h.to,
      transport: h.aircraft ?? "",
    }));
}

// ════════════════════════════════════════════════════════════
// Modal renderer
// ════════════════════════════════════════════════════════════

/**
 * Constructs and injects the HTML needed to render the final report modal.
 * @param {Object} report - The generated report payload.
 * @param {Object} state - The current travel state.
 */
function _renderReportModal(report, state) {
  const body = document.getElementById("reporte-body");
  if (!body) return;

  const {
    destinosVisitados,
    vuelosRecorridos,
    actividadesRealizadas,
    trabajosRealizados,
    totales,
  } = report;

  // Formatting date for Colombia as requested
  const ts = new Date().toLocaleString("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
  });

  body.innerHTML = `
    <div class="rpt-header">
      <div>
        <div class="rpt-title">Reporte de Viaje — SkyRoute Planner</div>
        <div class="rpt-subtitle">Generado el ${ts}</div>
      </div>
      <div class="rpt-badge ${totales.saldoFinal >= 0 ? "rpt-badge-ok" : "rpt-badge-warn"}">
        Saldo final: $${totales.saldoFinal.toFixed(2)} USD
      </div>
    </div>

    <div class="rpt-kpi-grid">
      ${_kpi("Presupuesto inicial", `$${(totales.presupuestoInicial ?? 0).toFixed(2)}`, "")}
      ${_kpi("Total gastado", `$${totales.totalGastado.toFixed(2)}`, "", "red")}
      ${_kpi("Total ganado", `$${totales.totalGanado.toFixed(2)}`, "", "green")}
      ${_kpi("Saldo final", `$${totales.saldoFinal.toFixed(2)}`, "")}
      ${_kpi("Tiempo total", `${totales.tiempoTotalHoras}h`, "")}
      ${_kpi("Destinos", String(totales.destinosVisitados), "")}
      ${_kpi("Vuelos", String(totales.vuelosRealizados), "")}
      ${_kpi("Actividades", String(totales.actividadesRealizadas), "")}
    </div>

    ${_section("Destinos Visitados", _renderDestinations(destinosVisitados))}
    ${_section("Tramos de Vuelo", _renderFlights(vuelosRecorridos))}
    ${
      actividadesRealizadas.length
        ? _section(
            "Actividades Realizadas",
            _renderActivities(actividadesRealizadas),
          )
        : ""
    }
    ${
      trabajosRealizados.length
        ? _section("Trabajos Realizados", _renderJobs(trabajosRealizados))
        : ""
    }
    ${_section("Resumen de Totales", _renderTotals(totales))}
  `;
}

// ── Sub-renderers ─────────────────────────────────────────────

/**
 * Wraps content in a standardized report section structure.
 */
function _section(title, content) {
  return `<div class="rpt-section"><div class="rpt-section-title">${title}</div>${content}</div>`;
}

/**
 * Generates a Key Performance Indicator (KPI) block.
 */
function _kpi(label, value, icon, accent = "") {
  return `
    <div class="rpt-kpi${accent ? " rpt-kpi-" + accent : ""}">
      ${icon ? `<span class="rpt-kpi-icon">${icon}</span>` : ""}
      <span class="rpt-kpi-value">${value}</span>
      <span class="rpt-kpi-label">${label}</span>
    </div>`;
}

/**
 * Renders the HTML block for visited destinations.
 */
function _renderDestinations(destinos) {
  if (!destinos?.length)
    return '<p class="rpt-empty">No hay destinos registrados.</p>';

  return destinos
    .map(
      (d, i) => `
    <div class="rpt-card">
      <div class="rpt-card-head">
        <span class="rpt-card-num">${i + 1}</span>
        <div>
          <strong>${d.id}</strong> — ${d.nombreAeropuerto}
          ${
            d.esHub
              ? '<span class="rpt-tag rpt-tag-hub">Hub</span>'
              : '<span class="rpt-tag rpt-tag-sec">Secundario</span>'
          }
        </div>
      </div>
      <div class="rpt-card-grid">
        <div class="rpt-row"><span>Ciudad</span><span>${d.ciudad}</span></div>
        <div class="rpt-row"><span>País</span><span>${d.pais}</span></div>
        <div class="rpt-row"><span>Zona horaria</span><span>${d.zonaHoraria}</span></div>
        <div class="rpt-row"><span>Alojamiento / noche</span><span>$${d.costoAlojamiento}</span></div>
        <div class="rpt-row"><span>Alimentación / comida</span><span>$${d.costoAlimentacion}</span></div>
        <div class="rpt-row rpt-row-total">
          <span>Costo total incurrido</span>
          <span>$${d.costoTotal.toFixed(2)} USD</span>
        </div>
      </div>
    </div>`,
    )
    .join("");
}

/**
 * Renders the HTML table for flown segments.
 */
function _renderFlights(vuelos) {
  if (!vuelos?.length)
    return '<p class="rpt-empty">No hay vuelos registrados.</p>';

  const totalDist = vuelos.reduce((a, v) => a + v.distanciaKm, 0);
  const totalTime = vuelos.reduce((a, v) => a + v.tiempoVuelo, 0);
  const totalCost = vuelos.reduce((a, v) => a + v.costoTramo, 0);

  return `
    <div class="rpt-table-wrap">
      <table class="rpt-table">
        <thead>
          <tr>
            <th>#</th><th>Origen</th><th>Destino</th><th>Aeronave</th>
            <th>Distancia</th><th>Tiempo de vuelo</th><th>Costo del tramo</th>
          </tr>
        </thead>
        <tbody>
          ${vuelos
            .map(
              (v, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${v.origen}</strong></td>
              <td><strong>${v.destino}</strong></td>
              <td>${v.aeronave}</td>
              <td>${v.distanciaKm} km</td>
              <td>${v.tiempoVuelo} min</td>
              <td>${
                v.subsidiado
                  ? '<span class="rpt-tag rpt-tag-sub">Subsidiado ($0)</span>'
                  : "$" + v.costoTramo.toFixed(2)
              }</td>
            </tr>`,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4"><strong>Totales</strong></td>
            <td><strong>${totalDist} km</strong></td>
            <td><strong>${totalTime} min</strong></td>
            <td><strong>$${totalCost.toFixed(2)} USD</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

/**
 * Renders the HTML table for completed activities.
 */
function _renderActivities(acts) {
  if (!acts?.length)
    return '<p class="rpt-empty">No hay actividades registradas.</p>';

  const totalCost = acts.reduce((a, x) => a + x.costoUSD, 0);

  return `
    <div class="rpt-table-wrap">
      <table class="rpt-table">
        <thead>
          <tr>
            <th>#</th><th>Nombre</th><th>Ubicación</th><th>Tipo</th>
            <th>Duración</th><th>Costo</th>
          </tr>
        </thead>
        <tbody>
          ${acts
            .map(
              (a, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${a.nombre}</td>
              <td>${a.ubicacion}</td>
              <td><span class="rpt-tag rpt-tag-act">${a.tipo}</span></td>
              <td>${a.duracion} min</td>
              <td>$${a.costoUSD.toFixed(2)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5"><strong>Total actividades</strong></td>
            <td><strong>$${totalCost.toFixed(2)} USD</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

/**
 * Renders the HTML table for completed jobs.
 */
function _renderJobs(jobs) {
  if (!jobs?.length)
    return '<p class="rpt-empty">No hay trabajos registrados.</p>';

  const totalHours = jobs.reduce((a, j) => a + j.horasTrabajadas, 0);
  const totalEarned = jobs.reduce((a, j) => a + j.ingresoObtenido, 0);

  return `
    <div class="rpt-table-wrap">
      <table class="rpt-table">
        <thead>
          <tr>
            <th>#</th><th>Nombre</th><th>Ubicación</th>
            <th>Horas trabajadas</th><th>Ingreso obtenido</th>
          </tr>
        </thead>
        <tbody>
          ${jobs
            .map(
              (j, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${j.nombre}</td>
              <td>${j.ubicacion}</td>
              <td>${j.horasTrabajadas}h</td>
              <td class="rpt-positive">+$${j.ingresoObtenido.toFixed(2)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3"><strong>Totales</strong></td>
            <td><strong>${totalHours}h</strong></td>
            <td class="rpt-positive"><strong>+$${totalEarned.toFixed(2)} USD</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

/**
 * Renders the HTML block summarizing all totals.
 */
function _renderTotals(t) {
  const balance = t.totalGanado - t.totalGastado;

  return `
    <div class="rpt-totales-grid">
      <div class="rpt-total-row">
        <span>Presupuesto inicial</span>
        <span class="rpt-num">$${(t.presupuestoInicial ?? 0).toFixed(2)} USD</span>
      </div>
      <div class="rpt-total-row rpt-neg">
        <span>Total gastado (vuelos + actividades + estadía)</span>
        <span class="rpt-num">– $${t.totalGastado.toFixed(2)} USD</span>
      </div>
      <div class="rpt-total-row rpt-pos">
        <span>Total ganado (trabajos)</span>
        <span class="rpt-num">+ $${t.totalGanado.toFixed(2)} USD</span>
      </div>
      <div class="rpt-total-row rpt-divider">
        <span>Balance neto (ganado - gastado)</span>
        <span class="rpt-num ${balance >= 0 ? "rpt-positive" : "rpt-negative"}">
          ${balance >= 0 ? "+" : ""}$${balance.toFixed(2)} USD
        </span>
      </div>
      <div class="rpt-total-row rpt-highlight">
        <span><strong>Saldo final (presupuesto restante)</strong></span>
        <span class="rpt-num"><strong>$${t.saldoFinal.toFixed(2)} USD</strong></span>
      </div>
      <div class="rpt-total-row">
        <span>Tiempo total del viaje</span>
        <span class="rpt-num">${t.tiempoTotalHoras}h (${t.tiempoTotalMinutos} min)</span>
      </div>
      <div class="rpt-total-row">
        <span>Destinos visitados</span>
        <span class="rpt-num">${t.destinosVisitados}</span>
      </div>
      <div class="rpt-total-row">
        <span>Vuelos realizados</span>
        <span class="rpt-num">${t.vuelosRealizados}</span>
      </div>
      <div class="rpt-total-row">
        <span>Actividades realizadas</span>
        <span class="rpt-num">${t.actividadesRealizadas}</span>
      </div>
      <div class="rpt-total-row">
        <span>Trabajos completados</span>
        <span class="rpt-num">${t.trabajosRealizados}</span>
      </div>
    </div>`;
}
