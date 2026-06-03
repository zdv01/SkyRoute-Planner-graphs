/**
 * routePerformanceManager.js — R2: Basic itinerary planning
 *
 * Handles:
 *  - Open/close of #modal-planificacion-basica
 *  - Populate airport selects when network is loaded
 *  - Call /api/routes/optimize and/or /api/routes/itinerary based on filled fields
 *  - Render results in #itinerary-info panel
 *  - Highlight path on canvas via GraphRenderer
 */

import {
  calculateOptimizedRoutes,
  generateItineraries,
} from "../services/routePerformanceService.js";
import { getRenderer, requireNetwork } from "./graphLoadManager.js";
import {
  showToast2,
  showLoading,
  openModal,
  closeAllModals,
} from "../../utils/utils.js";

// ════════════════════════════════════════════════════════════
// Initialisation
// ════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  // ── Toolbar button ───────────────────────────────────────
  document
    .getElementById("btn-planificacion-basica")
    ?.addEventListener("click", () =>
      requireNetwork(() => openModal("modal-planificacion-basica")),
    );
  document
    .getElementById("btn-mejor-ruta")
    ?.addEventListener("click", () => openModal("modal-mejor-ruta"));
  document
    .getElementById("btn-itinerario-basico")
    ?.addEventListener("click", () => openModal("modal-itinerario-basico"));

  // ── Calculate button ─────────────────────────────────────
  document
    .getElementById("btn-calcular-basico")
    ?.addEventListener("click", _handleCalcular);
  document
    .getElementById("btn-calcular-mejor-ruta")
    ?.addEventListener("click", _handleCalcular);

  // ── Populate selects when network loads ──────────────────
  document.addEventListener("skyroute:networkLoaded", (e) => {
    _populateSelects(e.detail.nodes || []);
  });

  // ── Clear selects and panel on reset ─────────────────────
  document.addEventListener("skyroute:networkReset", () => {
    _clearSelects();
    _setItineraryPanel(
      '<div class="empty-state"><p>No hay itinerario calculado</p></div>',
    );
  });
});

// ════════════════════════════════════════════════════════════
// Main handler
// ════════════════════════════════════════════════════════════

async function _handleCalcular() {
  const origin = document.getElementById("origen-basico")?.value || "";
  const destination = document.getElementById("destino-basico")?.value || "";
  const budget =
    parseFloat(document.getElementById("presupuesto-basico")?.value) || 0;
  const availableTime =
    parseFloat(document.getElementById("tiempo-basico")?.value) || 0;
  const criteria = [
    ...document.querySelectorAll('input[name="criterio-basico"]:checked'),
  ].map((el) => el.value);
  const excludeSecondary =
    document.getElementById("excluir-secundarios")?.checked ?? false;
  const preferredTransports = [
    ...document.querySelectorAll('input[name="transporte-basico"]:checked'),
  ].map((el) => el.value);

  // ── Validation ───────────────────────────────────────────
  if (!origin) {
    showToast2("Selecciona un aeropuerto de origen.", "warning");
    return;
  }

  const canOptimize = Boolean(destination && criteria.length > 0);
  const canItinerary = budget > 0 && availableTime > 0;

  if (!canOptimize && !canItinerary) {
    showToast2(
      "Completa al menos: (destino + criterio) o (presupuesto + tiempo disponible).",
      "warning",
    );
    return;
  }

  // ── Call APIs in parallel ────────────────────────────────
  closeAllModals();
  showLoading(true, "Calculando rutas…");

  const optimizeCall = canOptimize
    ? calculateOptimizedRoutes(
        origin,
        destination,
        criteria,
        excludeSecondary,
        preferredTransports,
      )
    : Promise.resolve(null);

  const itineraryCall = canItinerary
    ? generateItineraries(origin, budget, availableTime, preferredTransports)
    : Promise.resolve(null);

  const [optimizeSettled, itinerarySettled] = await Promise.allSettled([
    optimizeCall,
    itineraryCall,
  ]);

  showLoading(false);

  // ── Extract results / surface errors ─────────────────────
  const optimizeResult =
    optimizeSettled.status === "fulfilled" ? optimizeSettled.value?.data : null;
  const itineraryResult =
    itinerarySettled.status === "fulfilled"
      ? itinerarySettled.value?.data
      : null;

  if (optimizeSettled.status === "rejected")
    showToast2(`Optimización: ${optimizeSettled.reason?.message}`, "error");
  if (itinerarySettled.status === "rejected")
    showToast2(`Itinerario: ${itinerarySettled.reason?.message}`, "error");

  if (!optimizeResult && !itineraryResult) return;

  _renderResults(optimizeResult, itineraryResult);
  showToast2("Rutas calculadas correctamente.", "success");
}

// ════════════════════════════════════════════════════════════
// Rendering
// ════════════════════════════════════════════════════════════

function _renderResults(optimizeResult, itineraryResult) {
  let html = "";
  let pathToHighlight = null;

  // ── Itinerary alternatives ───────────────────────────────
  if (itineraryResult) {
    const { alternative_a, alternative_b } = itineraryResult;

    if (!alternative_a && !alternative_b) {
      html += _emptyAlt(
        "No se encontraron itinerarios con los parámetros indicados.",
      );
    } else {
      if (alternative_a) {
        pathToHighlight = alternative_a.sequence;
        html += _buildItineraryHTML(
          alternative_a,
          "Alternativa A — Más destinos por presupuesto",
          "cost",
        );
      } else {
        html += _emptyAlt(
          "Alt A: sin alternativa disponible con el presupuesto indicado.",
        );
      }

      if (alternative_b) {
        if (!pathToHighlight) pathToHighlight = alternative_b.sequence;
        html += _buildItineraryHTML(
          alternative_b,
          "Alternativa B — Más destinos en menor tiempo",
          "time",
        );
      } else {
        html += _emptyAlt(
          "Alt B: sin alternativa disponible con el tiempo indicado.",
        );
      }
    }
  }

  // ── Optimize paths ───────────────────────────────────────
  if (optimizeResult && Object.keys(optimizeResult).length > 0) {
    if (!pathToHighlight) {
      const firstKey = Object.keys(optimizeResult)[0];
      pathToHighlight = optimizeResult[firstKey]?.path;
    }
    html += _buildOptimizeHTML(optimizeResult);
  }

  if (!html) {
    html =
      '<div class="empty-state"><p>No se encontraron rutas con los parámetros indicados.</p></div>';
  }

  _setItineraryPanel(html);

  if (pathToHighlight?.length > 1) {
    getRenderer()?.highlightPath(pathToHighlight);
  }
}

// ════════════════════════════════════════════════════════════
// HTML builders
// ════════════════════════════════════════════════════════════

function _buildItineraryHTML(altData, label, type) {
  const isCost = type === "cost";

  const summary = isCost
    ? `${altData.total_destinations} destino(s) &nbsp;·&nbsp; <strong>$${altData.total_cost_usd} USD</strong> total`
    : `${altData.total_destinations} destino(s) &nbsp;·&nbsp; <strong>${altData.total_time_hours}h</strong> total`;

  const segmentsHTML = (altData.segments || [])
    .map((seg, i) => {
      const flightLabel =
        seg.flight_cost_usd === 0
          ? "Ruta subsidiada ($0)"
          : `$${seg.flight_cost_usd}`;
      const metricRows = isCost
        ? `<div class="step-detail-row"><span>Vuelo:</span><span>${flightLabel}</span></div>
           <div class="step-detail-row"><span>Alojamiento y alimentación:</span><span>$${seg.stay_cost_usd}</span></div>
           <div class="step-detail-row"><span>Actividades (prom. 3):</span><span>$${seg.activities_cost_usd}</span></div>
           <div class="step-detail-row"><span>Total tramo:</span><span>$${seg.segment_cost_usd}</span></div>
           <div class="step-detail-row"><span>Acumulado:</span><span>$${seg.accumulated_cost_usd}</span></div>`
        : `<div class="step-detail-row"><span>Tiempo vuelo:</span><span>${seg.flight_duration_hours}h</span></div>
           <div class="step-detail-row"><span>Tiempo estancia (minima):</span><span>${seg.min_stay_hours}h</span></div>
           <div class="step-detail-row"><span>Tiempo total:</span><span>${seg.segment_total_hours}h</span></div>
           <div class="step-detail-row"><span>Tiempo acumulado:</span><span>${seg.accumulated_time_hours}h</span></div>`;

      return `
      <div class="itinerary-step">
        <div class="step-header">
          <div class="step-number">${i + 1}</div>
          <div class="step-route">${seg.from} → ${seg.to}</div>
        </div>
        <div class="step-details">
          <div class="step-detail-row"><span>Transporte:</span><span>${seg.transport || "—"}</span></div>
          ${metricRows}
        </div>
      </div>`;
    })
    .join("");

  return `
    <div style="margin-bottom:1.5rem">
      <div style="padding:0.75rem 0 0.25rem;border-bottom:2px solid var(--primary-color);margin-bottom:0.75rem">
        <h4 style="margin:0;font-size:0.875rem;color:var(--primary-color)">${label}</h4>
        <p style="margin:0.25rem 0 0;font-size:0.8rem;color:var(--text-secondary)">${summary}</p>
      </div>
      ${segmentsHTML}
    </div>`;
}

function _buildOptimizeHTML(data) {
  const units = { distance: "km", time: "h", cost: "USD" };
  const labels = {
    distance: "Distancia mínima",
    time: "Tiempo mínimo",
    cost: "Costo mínimo",
  };

  return Object.entries(data)
    .map(([criterion, result]) => {
      const pathStr = (result.path || []).join(" → ");
      const unit = units[criterion] || "";
      const label = labels[criterion] || criterion;
      const metric =
        typeof result.total_metric === "number"
          ? result.total_metric.toFixed(2)
          : result.total_metric;

      return `
      <div style="margin-bottom:1.5rem">
        <div style="padding:0.75rem 0 0.25rem;border-bottom:2px solid var(--secondary-color);margin-bottom:0.75rem">
          <h4 style="margin:0;font-size:0.875rem;color:var(--secondary-color)">Ruta óptima — ${label}</h4>
          <p style="margin:0.25rem 0 0;font-size:0.8rem;color:var(--text-secondary)"><strong>${metric} ${unit}</strong></p>
        </div>
        <div class="itinerary-step">
          <div class="step-details" style="padding-top:0">
            <div class="step-detail-row">
              <span>Secuencia:</span>
            </div>
            <div style="font-family:monospace;font-size:0.8rem;margin-top:0.25rem;color:var(--text-primary);word-break:break-word">
              ${pathStr}
            </div>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function _emptyAlt(message) {
  return `<p style="font-size:0.8rem;color:var(--text-secondary);padding:0.5rem 0">${message}</p>`;
}

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════

function _populateSelects(nodes) {
  const options = nodes
    .map((n) => {
      const name = n.metadata?.AEROPUERTO || n.label || n.id;
      return `<option value="${n.id}">${n.id} — ${name}</option>`;
    })
    .join("");

  const defaultOpt = '<option value="">Seleccione aeropuerto...</option>';

  ["origen-basico", "destino-basico"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = defaultOpt + options;
  });
}

function _clearSelects() {
  const defaultOpt = '<option value="">Seleccione aeropuerto...</option>';
  ["origen-basico", "destino-basico"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = defaultOpt;
  });
}

function _setItineraryPanel(html) {
  const el = document.getElementById("itinerary-info");
  if (el) el.innerHTML = html;
}
