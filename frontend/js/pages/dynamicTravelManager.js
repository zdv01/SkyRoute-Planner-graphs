/**
 * dynamicTravelManager.js — R3: Advanced step-by-step planning
 *
 * Handles:
 *  - Open/close of #modal-planificacion-avanzada
 *  - Step-by-step travel loop: jobs → activities → flight selection
 *  - Sequential modal Promises: #modal-trabajos, #modal-actividades, #modal-transporte
 *  - State display in #itinerary-info panel
 *  - Canvas path highlight via GraphRenderer after each flight
 */

import {
  getNextStepOptions,
  processTravelAction,
} from "../services/dynamicTravelService.js";
import { getRenderer, requireNetwork } from "./graphLoadManager.js";
import {
  showToast2,
  showLoading,
  openModal,
  closeAllModals,
} from "../../utils/utils.js";

// ════════════════════════════════════════════════════════════
// Module state
// ════════════════════════════════════════════════════════════

let _travelState = null;
let _currentFlights = [];
let _stepLocked = false; // prevent double-clicks during async steps

// ════════════════════════════════════════════════════════════
// Initialisation
// ════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("btn-planificacion-avanzada")
    ?.addEventListener("click", () =>
      requireNetwork(() => openModal("modal-planificacion-avanzada")),
    );

  document
    .getElementById("btn-iniciar-avanzado")
    ?.addEventListener("click", _handleIniciarViaje);

  // Event delegation for panel actions (flight buttons + end journey)
  document.getElementById("itinerary-info")?.addEventListener("click", (e) => {
    if (e.target.closest("#btn-fin-viaje")) {
      _endJourney();
      return;
    }
    const flightBtn = e.target.closest(".btn-volar-destino");
    if (flightBtn && !_stepLocked) {
      _stepLocked = true;
      const destId = flightBtn.dataset.dest;
      const flights = _currentFlights.filter((f) => f.to === destId);
      if (flights.length > 0) {
        _showTransportModal(flights).catch(() => {
          _stepLocked = false;
        });
      } else {
        _stepLocked = false;
      }
    }
  });

  document.addEventListener("skyroute:networkLoaded", (e) => {
    _populateOriginSelect(e.detail.nodes || []);
  });

  document.addEventListener("skyroute:networkReset", () => {
    const el = document.getElementById("origen-avanzado");
    if (el) el.innerHTML = '<option value="">Seleccione aeropuerto...</option>';
    _travelState = null;
    _currentFlights = [];
  });
});

// ════════════════════════════════════════════════════════════
// Handlers
// ════════════════════════════════════════════════════════════

async function _handleIniciarViaje() {
  const origin = document.getElementById("origen-avanzado")?.value || "";
  const budget =
    parseFloat(document.getElementById("presupuesto-avanzado")?.value) || 0;

  if (!origin) {
    showToast2("Selecciona un aeropuerto de origen.", "warning");
    return;
  }
  if (budget <= 0) {
    showToast2("Ingresa un presupuesto mayor a 0.", "warning");
    return;
  }

  _travelState = {
    initial_budget: budget,
    current_budget: budget,
    current_node: origin,
    time_since_sleep: 0,
    time_since_food: 0,
    total_time_mins: 0,
    visited: [],
    history: [],
  };
  _currentFlights = [];

  closeAllModals();
  getRenderer()?.setCurrentNode(origin);
  _setItineraryPanel(
    '<div class="empty-state"><p>Iniciando viaje…</p></div>',
  );
  await _runNextStep();
}

// ─── Core loop ───────────────────────────────────────────────

async function _runNextStep() {
  if (!_travelState) return;

  showLoading(true, "Calculando opciones…");
  let resp = null;
  try {
    resp = await getNextStepOptions(_travelState);
  } catch (err) {
    showToast2(`Error al obtener opciones: ${err.message}`, "error");
    showLoading(false);
    return;
  }
  showLoading(false);

  const options = resp?.options ?? {};
  const suggestion = resp?.suggestion ?? null;
  _currentFlights = options.flights || [];

  // 1. Jobs (only if budget is below threshold)
  if (options.can_work && options.jobs?.length > 0) {
    const jobChoice = await _showJobsModal(options.jobs);
    if (jobChoice) {
      const ok = await _processAction("job", jobChoice);
      if (!ok) return;
    }
  }

  // 2. Activities
  if (options.activities?.length > 0) {
    const chosen = await _showActivitiesModal(options.activities);
    for (const activity of chosen) {
      const ok = await _processAction("activity", activity);
      if (!ok) return;
    }
  }

  // 3. Refresh flight options so mandatory costs reflect updated time
  const didSomething =
    (options.can_work && options.jobs?.length > 0) ||
    options.activities?.length > 0;
  if (didSomething) {
    try {
      showLoading(true, "Actualizando vuelos…");
      const fresh = await getNextStepOptions(_travelState);
      showLoading(false);
      _currentFlights = fresh?.options?.flights || _currentFlights;
    } catch {
      showLoading(false);
    }
  }

  // 4. Render panel with current state and available flights
  _renderTravelPanel(_currentFlights, suggestion);
  _stepLocked = false;
}

// ─── Process a single action ─────────────────────────────────

async function _processAction(type, details) {
  showLoading(true, "Procesando…");
  let result = null;
  try {
    result = await processTravelAction({
      action_type: type,
      action_details: details,
      current_state: _travelState,
    });
  } catch (err) {
    showToast2(`Error: ${err.message}`, "error");
    showLoading(false);
    return null;
  }
  showLoading(false);

  if (result?.status !== "success") {
    showToast2(result?.message || "Error al procesar la accion.", "error");
    return null;
  }

  _travelState = result.new_state;
  return result.new_state;
}

// ─── Flight animation awaiter ────────────────────────────────

function _waitForFlight(from, to, aircraft) {
  return new Promise((resolve) => {
    const renderer = getRenderer();
    if (!renderer) { resolve(); return; }
    renderer.animateFlight([from, to], [aircraft], resolve);
  });
}

// ─── End journey ─────────────────────────────────────────────

function _endJourney() {
  if (!_travelState) return;
  const spent = _travelState.initial_budget - _travelState.current_budget;
  showToast2(
    `Viaje finalizado: ${_travelState.visited.length} destinos · $${spent.toFixed(2)} USD gastados.`,
    "success",
    6000,
  );
  _setItineraryPanel(_buildFinalSummaryHTML(_travelState));
  getRenderer()?.setCurrentNode(null);
  getRenderer()?.clearHighlight();
  _travelState = null;
  _currentFlights = [];
  _stepLocked = false;
}

// ════════════════════════════════════════════════════════════
// Modal Promises
// ════════════════════════════════════════════════════════════

function _showJobsModal(jobs) {
  return new Promise((resolve) => {
    const list = document.getElementById("trabajos-list");
    if (list) list.innerHTML = _buildJobsHTML(jobs);
    openModal("modal-trabajos");

    const modal = document.getElementById("modal-trabajos");
    const confirmBtn = document.getElementById("btn-confirmar-trabajo");

    function cleanup() {
      confirmBtn?.removeEventListener("click", onConfirm);
      modal
        ?.querySelectorAll(".btn-cancel, .btn-close")
        .forEach((b) => b.removeEventListener("click", onDismiss));
      modal?.removeEventListener("click", onBackdrop);
    }

    function onConfirm() {
      const choice = _readJobSelection();
      if (!choice) return;
      cleanup();
      closeAllModals();
      resolve(choice);
    }

    function onDismiss() {
      cleanup();
      resolve(null);
    }

    function onBackdrop(e) {
      if (e.target === modal) onDismiss();
    }

    confirmBtn?.addEventListener("click", onConfirm);
    modal
      ?.querySelectorAll(".btn-cancel, .btn-close")
      .forEach((b) => b.addEventListener("click", onDismiss));
    modal?.addEventListener("click", onBackdrop);
  });
}

function _showActivitiesModal(activities) {
  return new Promise((resolve) => {
    const list = document.getElementById("actividades-list");
    if (list) list.innerHTML = _buildActivitiesHTML(activities);
    openModal("modal-actividades");

    const modal = document.getElementById("modal-actividades");
    const confirmBtn = document.getElementById("btn-confirmar-actividades");

    function cleanup() {
      confirmBtn?.removeEventListener("click", onConfirm);
      modal
        ?.querySelectorAll(".btn-cancel, .btn-close")
        .forEach((b) => b.removeEventListener("click", onDismiss));
      modal?.removeEventListener("click", onBackdrop);
    }

    function onConfirm() {
      cleanup();
      const chosen = _readActivitySelections(activities);
      closeAllModals();
      resolve(chosen);
    }

    function onDismiss() {
      cleanup();
      closeAllModals();
      resolve([]);
    }

    function onBackdrop(e) {
      if (e.target === modal) onDismiss();
    }

    confirmBtn?.addEventListener("click", onConfirm);
    modal
      ?.querySelectorAll(".btn-cancel, .btn-close")
      .forEach((b) => b.addEventListener("click", onDismiss));
    modal?.addEventListener("click", onBackdrop);
  });
}

async function _showTransportModal(flights) {
  const flightOption = await new Promise((resolve) => {
    const list = document.getElementById("transporte-list");
    if (list) list.innerHTML = _buildTransportHTML(flights);
    openModal("modal-transporte");

    const modal = document.getElementById("modal-transporte");
    const confirmBtn = document.getElementById("btn-confirmar-transporte");

    function cleanup() {
      confirmBtn?.removeEventListener("click", onConfirm);
      modal
        ?.querySelectorAll(".btn-close")
        .forEach((b) => b.removeEventListener("click", onDismiss));
      modal?.removeEventListener("click", onBackdrop);
    }

    function onConfirm() {
      const selected = _readTransportSelection();
      if (!selected) {
        showToast2("Selecciona un tipo de aeronave.", "warning");
        return;
      }
      cleanup();
      closeAllModals();
      resolve(selected);
    }

    function onDismiss() {
      cleanup();
      resolve(null);
    }

    function onBackdrop(e) {
      if (e.target === modal) onDismiss();
    }

    confirmBtn?.addEventListener("click", onConfirm);
    modal
      ?.querySelectorAll(".btn-close")
      .forEach((b) => b.addEventListener("click", onDismiss));
    modal?.addEventListener("click", onBackdrop);
  });

  if (!flightOption) {
    _stepLocked = false;
    return;
  }

  const result = await _processAction("flight", flightOption);
  if (!result) {
    _stepLocked = false;
    return;
  }

  // Mark destination on canvas, animate flight, then continue
  const from = _travelState.visited[_travelState.visited.length - 1];
  const to = _travelState.current_node;
  getRenderer()?.setCurrentNode(to);
  await _waitForFlight(from, to, flightOption.aircraft);

  showToast2(`Llegaste a ${flightOption.to}.`, "info", 2500);
  await _runNextStep();
}

// ════════════════════════════════════════════════════════════
// Read selections from modal DOM
// ════════════════════════════════════════════════════════════

function _readJobSelection() {
  const radio = document.querySelector(
    '#trabajos-list input[name="job-select"]:checked',
  );
  if (!radio) {
    showToast2("Selecciona un trabajo o pulsa Omitir.", "warning");
    return null;
  }
  const idx = parseInt(radio.value);
  const card = document.querySelector(`[data-job-idx="${idx}"]`);
  const horasInput = document.getElementById(`job-horas-${idx}`);
  const horas = parseFloat(horasInput?.value) || 0;
  if (horas <= 0) {
    showToast2("Ingresa al menos 1 hora de trabajo.", "warning");
    return null;
  }
  return {
    nombre: card?.dataset.nombre,
    tarifaHora: parseFloat(card?.dataset.tarifa),
    maxHoras: parseFloat(card?.dataset.maxHoras),
    horas,
  };
}

function _readActivitySelections(activities) {
  return Array.from(
    document.querySelectorAll(
      '#actividades-list input[type="checkbox"]:checked',
    ),
  ).map((cb) => activities[parseInt(cb.value)]);
}

function _readTransportSelection() {
  const radio = document.querySelector(
    '#transporte-list input[name="transport-select"]:checked',
  );
  if (!radio) return null;
  const card = document.querySelector(`[data-transport-idx="${radio.value}"]`);
  return {
    to: card?.dataset.to,
    to_name: card?.dataset.toName,
    aircraft: card?.dataset.aircraft,
    flight_cost: parseFloat(card?.dataset.flightCost),
    mandatory_extra_costs: parseFloat(card?.dataset.extraCosts),
    total_step_cost: parseFloat(card?.dataset.totalCost),
    flight_time_mins: parseFloat(card?.dataset.flightTime),
    distance_km: parseFloat(card?.dataset.distance),
  };
}

// ════════════════════════════════════════════════════════════
// HTML builders — modals
// ════════════════════════════════════════════════════════════

function _buildJobsHTML(jobs) {
  if (!jobs?.length)
    return '<p style="font-size:0.82rem;color:var(--text-secondary)">No hay trabajos disponibles.</p>';
  return jobs
    .map(
      (job, i) => `
    <div class="itinerary-step" data-job-idx="${i}"
         data-nombre="${job.nombre}" data-tarifa="${job.tarifaHora}" data-max-horas="${job.maxHoras}"
         style="margin-bottom:0.5rem">
      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;margin-bottom:0.3rem">
        <input type="radio" name="job-select" value="${i}" />
        <strong>${job.nombre}</strong>
      </label>
      <div class="step-detail-row"><span>Tarifa:</span><span>$${job.tarifaHora}/h</span></div>
      <div class="step-detail-row"><span>Max. horas:</span><span>${job.maxHoras}h</span></div>
      <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.35rem;font-size:0.8rem">
        <label for="job-horas-${i}">Horas:</label>
        <input type="number" id="job-horas-${i}" min="1" max="${job.maxHoras}" step="1"
               value="1" class="form-control-sm" style="width:4.5rem" />
        <span style="color:var(--text-secondary)">= $${job.tarifaHora.toFixed(2)}</span>
      </div>
    </div>`,
    )
    .join("");
}

function _buildActivitiesHTML(activities) {
  if (!activities?.length)
    return '<p style="font-size:0.82rem;color:var(--text-secondary)">No hay actividades disponibles.</p>';
  return activities
    .map(
      (act, i) => `
    <div style="margin-bottom:0.5rem;padding:0.5rem;border:1px solid var(--border-color,#ddd);border-radius:6px">
      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;margin-bottom:0.25rem">
        <input type="checkbox" value="${i}" />
        <strong>${act.nombre}</strong>
      </label>
      <div class="step-detail-row" style="font-size:0.8rem"><span>Tipo:</span><span>${act.tipo}</span></div>
      <div class="step-detail-row" style="font-size:0.8rem"><span>Duracion:</span><span>${act.duracionMin} min</span></div>
      <div class="step-detail-row" style="font-size:0.8rem"><span>Costo:</span><span>$${act.costoUSD} USD</span></div>
    </div>`,
    )
    .join("");
}

function _buildTransportHTML(flights) {
  const destId = flights[0]?.to ?? "—";
  const destName = flights[0]?.to_name ?? "";
  let html = `<p style="font-size:0.85rem;margin-bottom:0.6rem">Destino: <strong>${destId}${destName ? " — " + destName : ""}</strong></p>`;
  html += flights
    .map(
      (f, i) => `
    <div data-transport-idx="${i}"
         data-to="${f.to}" data-to-name="${f.to_name ?? ""}" data-aircraft="${f.aircraft}"
         data-flight-cost="${f.flight_cost}" data-extra-costs="${f.mandatory_extra_costs}"
         data-total-cost="${f.total_step_cost}" data-flight-time="${f.flight_time_mins}"
         data-distance="${f.distance_km}"
         style="margin-bottom:0.5rem;padding:0.5rem;border:1px solid var(--border-color,#ddd);border-radius:6px">
      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;margin-bottom:0.3rem">
        <input type="radio" name="transport-select" value="${i}" />
        <strong>${f.aircraft}</strong>
        ${f.subsidized ? '<span style="color:var(--success-color,#2e7d32);font-size:0.75rem">(subsidiado)</span>' : ""}
      </label>
      <div class="step-detail-row" style="font-size:0.8rem">
        <span>Costo vuelo:</span>
        <span>${f.subsidized ? "$0 (subsidiado)" : "$" + f.flight_cost + " USD"}</span>
      </div>
      <div class="step-detail-row" style="font-size:0.8rem">
        <span>Gastos oblig.:</span><span>$${f.mandatory_extra_costs} USD</span>
      </div>
      <div class="step-detail-row" style="font-size:0.8rem">
        <span><strong>Total tramo:</strong></span><span><strong>$${f.total_step_cost} USD</strong></span>
      </div>
      <div class="step-detail-row" style="font-size:0.8rem">
        <span>Tiempo:</span><span>${f.flight_time_mins.toFixed(0)} min · ${f.distance_km} km</span>
      </div>
    </div>`,
    )
    .join("");
  return html;
}

// ════════════════════════════════════════════════════════════
// Panel rendering
// ════════════════════════════════════════════════════════════

function _renderTravelPanel(flights, suggestion) {
  if (!_travelState) return;
  _setItineraryPanel(_buildTravelPanelHTML(flights, suggestion));
}

function _buildTravelPanelHTML(flights, suggestion) {
  const s = _travelState;
  const cfg = window._skyRouteConfig ?? {};
  const intervaloAloj = cfg.intervaloAlojamiento ?? 20;
  const intervaloAlim = cfg.intervaloAlimentacion ?? 8;

  const spent = s.initial_budget - s.current_budget;
  const totalHours = (s.total_time_mins / 60).toFixed(1);
  const sleepLeft = Math.max(0, intervaloAloj - s.time_since_sleep).toFixed(1);
  const foodLeft = Math.max(0, intervaloAlim - s.time_since_food).toFixed(1);

  // Path chips
  const pathNodes = [...(s.visited || []), s.current_node];
  const pathHTML = pathNodes
    .map((id, i) => {
      const isCurrent = i === pathNodes.length - 1;
      return (
        `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:0.75rem;` +
        `font-weight:${isCurrent ? "700" : "400"};` +
        `background:${isCurrent ? "var(--primary-color,#1565c0)" : "var(--border-color,#ddd)"};` +
        `color:${isCurrent ? "#fff" : "var(--text-primary,#333)"}">${id}</span>` +
        (i < pathNodes.length - 1
          ? '<span style="font-size:0.75rem;padding:0 2px">→</span>'
          : "")
      );
    })
    .join("");

  // History (last 6 items, most recent first)
  const historyHTML =
    (s.history || [])
      .slice(-6)
      .reverse()
      .map((h) => {
        if (h.type === "flight")
          return `<div style="font-size:0.78rem;padding:2px 0">✈ ${h.from} → ${h.to} · ${h.aircraft} · <span style="color:#c62828">-$${h.cost}</span></div>`;
        if (h.type === "job")
          return `<div style="font-size:0.78rem;padding:2px 0">💼 ${h.name} · ${h.hours}h · <span style="color:#2e7d32">+$${h.earned}</span></div>`;
        return `<div style="font-size:0.78rem;padding:2px 0">🎯 ${h.name} · <span style="color:#c62828">-$${h.cost}</span></div>`;
      })
      .join("") ||
    '<div style="font-size:0.78rem;color:var(--text-secondary)">Sin acciones previas.</div>';

  // One button per unique destination, sorted by min cost
  const destMap = new Map();
  for (const f of flights) {
    if (
      !destMap.has(f.to) ||
      f.total_step_cost < destMap.get(f.to).minCost
    ) {
      destMap.set(f.to, {
        to: f.to,
        to_name: f.to_name,
        already_visited: f.already_visited,
        minCost: f.total_step_cost,
      });
    }
  }

  const flightBtnsHTML = destMap.size
    ? Array.from(destMap.values())
        .sort((a, b) => a.minCost - b.minCost)
        .map((d) => {
          const isSuggested = suggestion && d.to === suggestion.to;
          const canAfford = s.current_budget >= d.minCost;
          return `
          <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.35rem">
            <button class="btn ${isSuggested ? "btn-success" : "btn-primary"} btn-volar-destino"
                    style="flex:1;text-align:left;padding:0.35rem 0.7rem;font-size:0.8rem;${!canAfford ? "opacity:0.5;" : ""}"
                    data-dest="${d.to}" ${!canAfford ? "disabled" : ""}>
              ✈ ${d.to}${d.to_name ? " — " + d.to_name : ""}
              ${d.already_visited ? '<span style="font-size:0.7rem;opacity:0.7"> (visitado)</span>' : ""}
              ${isSuggested ? '<span style="font-size:0.7rem"> ★ sugerido</span>' : ""}
            </button>
            <span style="font-size:0.76rem;color:var(--text-secondary);white-space:nowrap">
              desde $${d.minCost.toFixed(2)}
            </span>
          </div>`;
        })
        .join("")
    : '<p style="font-size:0.82rem;color:var(--text-secondary)">Sin vuelos disponibles.</p>';

  return `
  <div style="font-family:inherit">
    <div style="padding:0.6rem 0 0.4rem;border-bottom:2px solid var(--primary-color,#1565c0);margin-bottom:0.75rem;display:flex;justify-content:space-between;align-items:center">
      <h4 style="margin:0;font-size:0.875rem;color:var(--primary-color,#1565c0)">Planificacion Avanzada — En Curso</h4>
      <button id="btn-fin-viaje" class="btn btn-secondary" style="padding:0.2rem 0.55rem;font-size:0.75rem">Fin del Viaje</button>
    </div>

    <div style="background:var(--surface-alt,#f5f7fa);border-radius:8px;padding:0.65rem;margin-bottom:0.75rem">
      <div class="step-detail-row"><span>Aeropuerto actual:</span><span><strong>${s.current_node}</strong></span></div>
      <div class="step-detail-row">
        <span>Presupuesto:</span>
        <span><strong style="color:${s.current_budget < s.initial_budget * 0.35 ? "#c62828" : "inherit"}">$${s.current_budget.toFixed(2)} USD</strong>
          <span style="font-size:0.73rem;color:var(--text-secondary)"> (gastado: $${spent.toFixed(2)})</span></span>
      </div>
      <div class="step-detail-row"><span>Tiempo total:</span><span>${totalHours}h</span></div>
      <div class="step-detail-row"><span>Proxima comida en:</span><span>${foodLeft}h</span></div>
      <div class="step-detail-row"><span>Proximo aloj. en:</span><span>${sleepLeft}h</span></div>
      <div class="step-detail-row"><span>Destinos visitados:</span><span>${s.visited.length}</span></div>
    </div>

    <div style="margin-bottom:0.75rem">
      <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 0.3rem">Ruta:</p>
      <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">${pathHTML}</div>
    </div>

    <div style="border-top:1px solid var(--border-color,#ddd);padding-top:0.6rem;margin-bottom:0.75rem">
      <p style="font-size:0.82rem;font-weight:600;margin:0 0 0.45rem">Vuelos disponibles:</p>
      ${flightBtnsHTML}
    </div>

    <div style="border-top:1px solid var(--border-color,#ddd);padding-top:0.5rem">
      <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 0.25rem">Ultimas acciones:</p>
      ${historyHTML}
    </div>
  </div>`;
}

function _buildFinalSummaryHTML(state) {
  const spent = state.initial_budget - state.current_budget;
  const totalHours = (state.total_time_mins / 60).toFixed(1);
  const allNodes = [...(state.visited || []), state.current_node];
  const pathStr = allNodes.join(" → ");

  const historyHTML =
    (state.history || [])
      .map((h, i) => {
        if (h.type === "flight")
          return `<div style="font-size:0.78rem;padding:2px 0">${i + 1}. ✈ ${h.from} → ${h.to} · ${h.aircraft} · -$${h.cost} · ${h.time_mins.toFixed(0)} min</div>`;
        if (h.type === "job")
          return `<div style="font-size:0.78rem;padding:2px 0">${i + 1}. 💼 ${h.name} · ${h.hours}h · +$${h.earned}</div>`;
        return `<div style="font-size:0.78rem;padding:2px 0">${i + 1}. 🎯 ${h.name} · ${h.time_mins} min · -$${h.cost}</div>`;
      })
      .join("") ||
    '<p style="font-size:0.78rem;color:var(--text-secondary)">Sin acciones registradas.</p>';

  return `
  <div style="font-family:inherit">
    <div style="padding:0.6rem 0 0.4rem;border-bottom:2px solid var(--primary-color,#1565c0);margin-bottom:0.75rem">
      <h4 style="margin:0;font-size:0.875rem;color:var(--primary-color,#1565c0)">Resumen Final del Viaje</h4>
    </div>
    <div class="step-detail-row"><span>Destinos visitados:</span><span><strong>${state.visited.length}</strong></span></div>
    <div class="step-detail-row"><span>Presupuesto inicial:</span><span>$${state.initial_budget} USD</span></div>
    <div class="step-detail-row"><span>Presupuesto restante:</span><span>$${state.current_budget.toFixed(2)} USD</span></div>
    <div class="step-detail-row"><span>Total gastado:</span><span><strong>$${spent.toFixed(2)} USD</strong></span></div>
    <div class="step-detail-row"><span>Tiempo total:</span><span>${totalHours}h</span></div>
    <div style="margin:0.75rem 0">
      <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 0.25rem">Ruta completa:</p>
      <div style="font-family:monospace;font-size:0.8rem;word-break:break-word">${pathStr}</div>
    </div>
    <div style="border-top:1px solid var(--border-color,#ddd);padding-top:0.5rem">
      <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 0.25rem">Registro completo:</p>
      ${historyHTML}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════

function _populateOriginSelect(nodes) {
  const el = document.getElementById("origen-avanzado");
  if (!el) return;
  const options = nodes
    .map((n) => {
      const name = n.metadata?.AEROPUERTO || n.label || n.id;
      return `<option value="${n.id}">${n.id} — ${name}</option>`;
    })
    .join("");
  el.innerHTML =
    '<option value="">Seleccione aeropuerto...</option>' + options;
}

function _setItineraryPanel(html) {
  const el = document.getElementById("itinerary-info");
  if (el) el.innerHTML = html;
}
