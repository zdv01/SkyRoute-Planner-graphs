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
    ?.addEventListener("click", _handleCalculateItinerary);
  document
    .getElementById("btn-calcular-mejor-ruta")
    ?.addEventListener("click", _handleCalculateBestRoute);

  // ── Populate selects when network loads ──────────────────
  document.addEventListener("skyroute:networkLoaded", (e) => {
    _populateSelects(e.detail.nodes || []);
  });

  // ── Visualizar / Ejecutar Ruta buttons (event delegation) ──
  document.getElementById("itinerary-info")?.addEventListener("click", (e) => {
    // "Ejecutar Ruta" — animated flight simulation
    const execBtn = e.target.closest(".btn-ejecutar-ruta");
    if (execBtn) {
      const path = execBtn.dataset.path?.split(",").filter(Boolean);
      const transports =
        execBtn.dataset.transports?.split(",").filter(Boolean) || [];
      if (path?.length > 1) getRenderer()?.animateFlight(path, transports);
      return;
    }

    // "Visualizar" — static path highlight
    const btn = e.target.closest(".btn-visualizar");
    if (!btn) return;
    const path = btn.dataset.path?.split(",").filter(Boolean);
    const segments = (btn.dataset.segments || "")
      .split(",")
      .filter(Boolean)
      .map((s) => {
        const [from, to, transport] = s.split(":");
        return { from, to, transport: decodeURIComponent(transport || "") };
      });
    if (path?.length > 1) getRenderer()?.highlightPath(path, segments);
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
// Handlers per modal
// ════════════════════════════════════════════════════════════

async function _handleCalculateItinerary() {
  const origin = document.getElementById("origen-basico")?.value || "";
  const budget =
    parseFloat(document.getElementById("presupuesto-basico")?.value) || 0;
  const availableTime =
    parseFloat(document.getElementById("tiempo-basico")?.value) || 0;

  if (!origin) {
    showToast2("Selecciona un aeropuerto de origen.", "warning");
    return;
  }
  if (budget <= 0 || availableTime <= 0) {
    showToast2(
      "Ingresa un presupuesto y tiempo disponible mayores a 0.",
      "warning",
    );
    return;
  }

  closeAllModals();
  showLoading(true, "Generando itinerarios…");

  let result = null;
  try {
    const resp = await generateItineraries(origin, budget, availableTime, []);
    result = resp?.data ?? null;
  } catch (err) {
    showToast2(`Itinerario: ${err?.message}`, "error");
  }

  showLoading(false);
  if (!result) return;

  _setItineraryPanel(_renderItinerarySection(result));
  showToast2("Itinerarios calculados correctamente.", "success");
}

async function _handleCalculateBestRoute() {
  const origin = document.getElementById("origen-mejor-ruta")?.value || "";
  const destination = document.getElementById("destino-basico")?.value || "";
  const criteria = [
    ...document.querySelectorAll('input[name="criterio-basico"]:checked'),
  ].map((el) => el.value);
  const excludeSecondary =
    document.getElementById("excluir-secundarios")?.checked ?? false;
  const preferredTransports = [
    ...document.querySelectorAll('input[name="transporte-basico"]:checked'),
  ].map((el) => el.value);

  if (!origin) {
    showToast2("Selecciona un aeropuerto de origen.", "warning");
    return;
  }
  if (!destination) {
    showToast2("Selecciona un aeropuerto de destino.", "warning");
    return;
  }
  if (criteria.length === 0) {
    showToast2("Selecciona al menos un criterio de optimización.", "warning");
    return;
  }
  if (preferredTransports.length === 0) {
    showToast2("Selecciona al menos un tipo de transporte.", "warning");
    return;
  }

  closeAllModals();
  showLoading(true, "Calculando mejor ruta…");

  let result = null;
  try {
    const resp = await calculateOptimizedRoutes(
      origin,
      destination,
      criteria,
      excludeSecondary,
      preferredTransports,
    );
    result = resp?.data ?? null;
  } catch (err) {
    showToast2(`Optimización: ${err?.message}`, "error");
  }

  showLoading(false);
  if (!result || Object.keys(result).length === 0) {
    showToast2(
      "No se encontraron rutas con los parámetros indicados.",
      "warning",
    );
    return;
  }

  _setItineraryPanel(_renderOptimizeSection(result, preferredTransports));
  showToast2("Rutas calculadas correctamente.", "success");
}

// ════════════════════════════════════════════════════════════
// Rendering
// ════════════════════════════════════════════════════════════

function _renderItinerarySection(itineraryResult) {
  const { alternative_a, alternative_b } = itineraryResult;

  if (!alternative_a && !alternative_b) {
    return _emptyAlt(
      "No se encontraron itinerarios con los parámetros indicados.",
    );
  }

  let html = "";
  if (alternative_a) {
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
  return html;
}

function _renderOptimizeSection(optimizeResult, preferredTransports = []) {
  return _buildOptimizeHTML(optimizeResult, preferredTransports);
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

  const pathAttr = (altData.sequence || []).join(",");
  const segmentsAttr = (altData.segments || [])
    .map((s) => `${s.from}:${s.to}:${encodeURIComponent(s.transport || "")}`)
    .join(",");

  return `
    <div style="margin-bottom:1.5rem">
      <div style="padding:0.75rem 0 0.25rem;border-bottom:2px solid var(--primary-color);margin-bottom:0.75rem">
        <h4 style="margin:0;font-size:0.875rem;color:var(--primary-color)">${label}</h4>
        <p style="margin:0.25rem 0 0;font-size:0.8rem;color:var(--text-secondary)">${summary}</p>
      </div>
      ${segmentsHTML}
      <div style="text-align:right;margin-top:0.5rem">
        <button class="btn btn-primary btn-visualizar" style="padding:0.35rem 0.9rem;font-size:0.78rem" data-path="${pathAttr}" data-segments="${segmentsAttr}">Visualizar</button>
      </div>
    </div>`;
}

function _buildOptimizeHTML(data, preferredTransports = []) {
  const labels = {
    distance: "Distancia mínima",
    time: "Tiempo mínimo",
    cost: "Costo mínimo",
    "distance+time": "Distancia + Tiempo optimizados",
    "distance+cost": "Distancia + Costo optimizados",
    "time+cost": "Tiempo + Costo optimizados",
    "distance+time+cost": "Distancia + Tiempo + Costo optimizados",
  };

  const transportAttr = preferredTransports.join(",");

  return Object.entries(data)
    .map(([criterion, result]) => {
      const pathStr = (result.path || []).join(" → ");
      const label = labels[criterion] || criterion;
      const pathAttr = (result.path || []).join(",");
      const isCombined = criterion.includes("+");

      const singleUnits = { distance: "km", time: "h", cost: "USD" };
      let metricHTML = "";
      if (isCombined && result.breakdown) {
        const subCriteria = new Set(criterion.split("+"));
        const b = result.breakdown;
        const parts = [];
        if (subCriteria.has("distance") && b.distance != null)
          parts.push(`Distancia: <strong>${b.distance.toFixed(2)} km</strong>`);
        if (subCriteria.has("time") && b.time != null)
          parts.push(`Tiempo: <strong>${b.time.toFixed(2)} h</strong>`);
        if (subCriteria.has("cost") && b.cost != null)
          parts.push(`Costo: <strong>$${b.cost.toFixed(2)} USD</strong>`);
        metricHTML = parts.join(" &nbsp;·&nbsp; ");
      } else {
        const unit = singleUnits[criterion] || "";
        const metric =
          typeof result.total_metric === "number"
            ? result.total_metric.toFixed(2)
            : result.total_metric;
        metricHTML = `<strong>${metric} ${unit}</strong>`;
      }

      return `
      <div style="margin-bottom:1.5rem">
        <div style="padding:0.75rem 0 0.25rem;border-bottom:2px solid var(--secondary-color);margin-bottom:0.75rem">
          <h4 style="margin:0;font-size:0.875rem;color:var(--secondary-color)">Ruta óptima — ${label}</h4>
          <p style="margin:0.25rem 0 0;font-size:0.8rem;color:var(--text-secondary)">${metricHTML}</p>
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
        <div style="text-align:right;margin-top:0.5rem;display:flex;gap:0.5rem;justify-content:flex-end">
          <button class="btn btn-secondary btn-visualizar" style="padding:0.35rem 0.9rem;font-size:0.78rem" data-path="${pathAttr}">Visualizar</button>
          <button class="btn btn-success btn-ejecutar-ruta" style="padding:0.35rem 0.9rem;font-size:0.78rem" data-path="${pathAttr}" data-transports="${transportAttr}">Ejecutar Ruta</button>
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

  ["origen-basico", "origen-mejor-ruta", "destino-basico"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = defaultOpt + options;
  });
}

function _clearSelects() {
  const defaultOpt = '<option value="">Seleccione aeropuerto...</option>';
  ["origen-basico", "origen-mejor-ruta", "destino-basico"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = defaultOpt;
  });
}

function _setItineraryPanel(html) {
  const el = document.getElementById("itinerary-info");
  if (el) el.innerHTML = html;
}
