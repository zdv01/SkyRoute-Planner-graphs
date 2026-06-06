/**
 * interruptionManager.js — R4: Route interruptions
 *
 * Flow:
 *  1. "Interrumpir Ruta" → open modal, populate <select> with active routes
 *  2. User picks a route. Flight animation keeps running behind the modal.
 *  3. Confirm → block on backend, edge turns red/dashed on canvas.
 *  4. If the animated ball is flying on that exact segment → stop forward
 *     motion and play animateReturn() so the ball travels visually back
 *     to the segment origin before opening the manager.
 *  5. Recalculate → highlight path on canvas AND render it in the
 *     "Itinerario Calculado" left panel so the user can execute it.
 */

import {
  blockRoute,
  unblockRoute,
  getNetworkStatus,
  recalculateRoute,
  clearAllBlocks,
} from "../services/interruptionService.js";

import { getRenderer, getNetworkData, requireNetwork } from "./graphLoadManager.js";

import {
  showToast2,
  openModal,
  closeAllModals,
  showLoading,
} from "../../utils/utils.js";

// ════════════════════════════════════════════════════════════
// Initialisation
// ════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {

  document
    .getElementById("btn-interrumpir-ruta")
    ?.addEventListener("click", () =>
      requireNetwork(() => {
        _populateRouteSelect();
        _resetBlockModal();
        openModal("modal-interrumpir-ruta");
      }),
    );

  document
    .getElementById("select-ruta-bloquear")
    ?.addEventListener("change", (e) => {
      const btn = document.getElementById("btn-confirmar-bloqueo");
      if (btn) btn.disabled = !e.target.value;
    });

  document
    .getElementById("btn-confirmar-bloqueo")
    ?.addEventListener("click", _handleConfirmBlock);

  document.getElementById("btn-ver-bloqueos")?.addEventListener("click", () => {
    closeAllModals();
    _openManager();
  });

  document
    .getElementById("btn-recalcular-ruta")
    ?.addEventListener("click", _handleRecalculate);

  document
    .getElementById("btn-limpiar-todos-bloqueos")
    ?.addEventListener("click", _handleClearAll);

  document.addEventListener("skyroute:networkLoaded", (e) => {
    _populateRecalcSelects(e.detail.nodes || []);
  });

  document.addEventListener("skyroute:networkReset", () => {
    _clearRecalcSelects();
  });
});

// ════════════════════════════════════════════════════════════
// Populate route <select>
// ════════════════════════════════════════════════════════════

function _populateRouteSelect() {
  const sel = document.getElementById("select-ruta-bloquear");
  if (!sel) return;

  const active = (getNetworkData()?.links ?? [])
    .filter((l) => !l.isBlocked)
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  if (active.length === 0) {
    sel.innerHTML = '<option value="">No hay rutas activas disponibles</option>';
    return;
  }

  sel.innerHTML =
    '<option value="">— Selecciona una ruta —</option>' +
    active
      .map(
        (l) =>
          `<option value="${l.source}|${l.target}">${l.source} → ${l.target} (${l.distance ?? "?"} km)</option>`,
      )
      .join("");
}

// ════════════════════════════════════════════════════════════
// Block handler
// ════════════════════════════════════════════════════════════

async function _handleConfirmBlock() {
  const value = document.getElementById("select-ruta-bloquear")?.value ?? "";
  if (!value) return;

  const [source, target] = value.split("|");
  const reason = document.getElementById("motivo-bloqueo")?.value || "Otro";

  showLoading(true, `Bloqueando ruta ${source} → ${target}…`);
  try {
    const result = await blockRoute(source, target, reason);

    if (!result.success) {
      showToast2(result.message || "No se pudo bloquear la ruta.", "error");
      return;
    }

    getRenderer()?.updateEdgeState(source, target, true);
    _updateToolbarStats();
    _checkInTransitInterruption(source, target);

    showToast2(`Ruta ${source} → ${target} bloqueada.`, "success");
    closeAllModals();
    _resetBlockModal();
  } catch (err) {
    showToast2(`Error al bloquear: ${err.message}`, "error");
  } finally {
    showLoading(false);
  }
}

// ════════════════════════════════════════════════════════════
// In-transit interruption with return animation
// ════════════════════════════════════════════════════════════

function _checkInTransitInterruption(blockedOrigin, blockedDest) {
  const renderer = getRenderer();
  const anim     = renderer?._flightAnim;
  if (!anim?.active || anim.isReturn) return;

  const currentSeg = anim.segments?.[anim.currentSeg];
  if (!currentSeg) return;
  if (currentSeg.from !== blockedOrigin || currentSeg.to !== blockedDest) return;

  const finalDest = anim.segments.at(-1)?.to ?? "";
  const startT    = anim.currentT ?? 1.0;

  // Stop forward animation
  anim.active          = false;
  renderer._flightAnim = null;
  renderer.clearHighlight();

  showToast2(
    `Vuelo interrumpido. El avión regresa a ${blockedOrigin}…`,
    "warning",
    7000,
  );

  // Animate ball returning to origin along the same curve (reversed)
  renderer.animateReturn(blockedOrigin, blockedDest, startT, () => {
    renderer.setCurrentNode(blockedOrigin);

    document.dispatchEvent(
      new CustomEvent("skyroute:flightInterrupted", {
        detail: { returnAirport: blockedOrigin, finalDestination: finalDest },
      }),
    );

    setTimeout(() => {
      const oSel = document.getElementById("recalc-origin");
      const dSel = document.getElementById("recalc-destination");
      if (oSel) oSel.value = blockedOrigin;
      if (dSel && finalDest) dSel.value = finalDest;
      _openManager(true);
    }, 600);
  });
}

// ════════════════════════════════════════════════════════════
// Blocked routes manager modal
// ════════════════════════════════════════════════════════════

async function _openManager(scrollToRecalc = false) {
  await _refreshBlockedList();
  openModal("modal-gestionar-bloqueos");
  if (scrollToRecalc) {
    setTimeout(
      () => document.getElementById("recalc-section")?.scrollIntoView({ behavior: "smooth" }),
      300,
    );
  }
}

async function _refreshBlockedList() {
  const listEl = document.getElementById("blocked-routes-list");
  if (!listEl) return;

  listEl.innerHTML =
    '<p style="font-size:0.82rem;color:var(--text-secondary)">Consultando red…</p>';

  try {
    const status  = await getNetworkStatus();
    const blocked = status.blocked_routes_detail || [];

    if (blocked.length === 0) {
      listEl.innerHTML =
        '<p style="font-size:0.82rem;color:var(--text-secondary)">No hay rutas bloqueadas.</p>';
      return;
    }

    listEl.innerHTML = blocked
      .map(
        (r) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:0.55rem 0.75rem;border:1px solid var(--border-color);
                    border-radius:6px;margin-bottom:0.4rem;gap:0.5rem;
                    border-left:4px solid #ef4444">
          <div>
            <strong style="font-size:0.875rem">${r.origin} → ${r.destination}</strong><br>
            <span style="font-size:0.75rem;color:var(--text-secondary)">
              Motivo: ${r.reason || "–"}
            </span>
          </div>
          <div style="display:flex;gap:0.4rem;flex-shrink:0">
            <button class="btn btn-success" style="padding:0.2rem 0.65rem;font-size:0.75rem"
              onclick="window._skyRouteUnblock('${r.origin}','${r.destination}')">
              Desbloquear
            </button>
            <button class="btn btn-primary" style="padding:0.2rem 0.65rem;font-size:0.75rem"
              onclick="window._skyRoutePreFillRecalc('${r.origin}','${r.destination}')">
              Recalcular
            </button>
          </div>
        </div>`,
      )
      .join("");
  } catch (err) {
    listEl.innerHTML = `<p style="font-size:0.82rem;color:var(--danger-color)">Error: ${err.message}</p>`;
  }
}

window._skyRouteUnblock = async function (origin, destination) {
  showLoading(true, `Desbloqueando ${origin} → ${destination}…`);
  try {
    const result = await unblockRoute(origin, destination);
    if (!result.success) { showToast2(result.message || "Error.", "error"); return; }
    getRenderer()?.updateEdgeState(origin, destination, false);
    _updateToolbarStats();
    showToast2(`Ruta ${origin} → ${destination} reactivada.`, "success");
    await _refreshBlockedList();
  } catch (err) {
    showToast2(`Error: ${err.message}`, "error");
  } finally {
    showLoading(false);
  }
};

window._skyRoutePreFillRecalc = function (origin, destination) {
  const oSel = document.getElementById("recalc-origin");
  const dSel = document.getElementById("recalc-destination");
  if (oSel) oSel.value = origin;
  if (dSel) dSel.value = destination;
  document.getElementById("recalc-section")?.scrollIntoView({ behavior: "smooth" });
};

// ════════════════════════════════════════════════════════════
// Recalculate alternative route
// ════════════════════════════════════════════════════════════

async function _handleRecalculate() {
  const origin      = document.getElementById("recalc-origin")?.value      ?? "";
  const destination = document.getElementById("recalc-destination")?.value ?? "";

  if (!origin || !destination) {
    showToast2("Selecciona aeropuerto de origen y destino.", "warning");
    return;
  }
  if (origin === destination) {
    showToast2("El origen y destino no pueden ser iguales.", "warning");
    return;
  }

  showLoading(true, `Buscando ruta alternativa ${origin} → ${destination}…`);
  try {
    const result = await recalculateRoute(origin, destination);

    if (!result.success) {
      showToast2(result.message || "No existe ruta alternativa disponible.", "warning");
      return;
    }

    // Highlight on canvas
    getRenderer()?.highlightPath(result.path);

    // Show in itinerary panel
    _setAltRoutePanel(result);

    showToast2(
      `Ruta alternativa: ${result.path.join(" → ")} · ${result.total_distance} km`,
      "success",
      8000,
    );
    closeAllModals();
  } catch (err) {
    showToast2(`Error al recalcular: ${err.message}`, "error");
  } finally {
    showLoading(false);
  }
}

// ════════════════════════════════════════════════════════════
// Render recalculated route in the "Itinerario Calculado" panel.
// btn-visualizar and btn-ejecutar-ruta are picked up by the
// event delegation already wired in routePerformanceManager.
// ════════════════════════════════════════════════════════════

function _setAltRoutePanel(result) {
  const el = document.getElementById("itinerary-info");
  if (!el) return;

  const pathAttr = result.path.join(",");
  const pathStr  = result.path.join(" → ");
  const stops    = result.path.length - 1;

  el.innerHTML = `
    <div style="font-family:inherit">
      <div style="padding:0.6rem 0 0.4rem;
                  border-bottom:2px solid var(--danger-color,#ef4444);
                  margin-bottom:0.75rem">
        <h4 style="margin:0;font-size:0.875rem;color:var(--danger-color,#ef4444)">
          Ruta alternativa recalculada
        </h4>
        <p style="margin:0.25rem 0 0;font-size:0.8rem;color:var(--text-secondary)">
          Evita las rutas bloqueadas actualmente
        </p>
      </div>

      <div class="itinerary-step">
        <div class="step-details">
          <div class="step-detail-row"><span>Secuencia:</span></div>
          <div style="font-family:monospace;font-size:0.8rem;margin-top:0.25rem;
                      color:var(--text-primary);word-break:break-word">
            ${pathStr}
          </div>
          <div class="step-detail-row" style="margin-top:0.5rem">
            <span>Distancia total:</span>
            <span><strong>${result.total_distance} km</strong></span>
          </div>
          <div class="step-detail-row">
            <span>Tramos:</span>
            <span>${stops}</span>
          </div>
        </div>
      </div>

      <div style="text-align:right;margin-top:0.75rem;
                  display:flex;gap:0.5rem;justify-content:flex-end">
        <button class="btn btn-secondary btn-visualizar"
                style="padding:0.35rem 0.9rem;font-size:0.78rem"
                data-path="${pathAttr}">
          Visualizar
        </button>
        <button class="btn btn-success btn-ejecutar-ruta"
                style="padding:0.35rem 0.9rem;font-size:0.78rem"
                data-path="${pathAttr}" data-transports="">
          Ejecutar Ruta
        </button>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// Clear all blocks
// ════════════════════════════════════════════════════════════

async function _handleClearAll() {
  showLoading(true, "Reactivando todas las rutas…");
  try {
    await clearAllBlocks();
    getRenderer()?.syncBlockedRoutes([]);
    _updateToolbarStats();
    showToast2("Todas las rutas han sido reactivadas.", "success");
    await _refreshBlockedList();
  } catch (err) {
    showToast2(`Error: ${err.message}`, "error");
  } finally {
    showLoading(false);
  }
}

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════

function _resetBlockModal() {
  const sel = document.getElementById("select-ruta-bloquear");
  if (sel) sel.value = "";
  const btn = document.getElementById("btn-confirmar-bloqueo");
  if (btn) btn.disabled = true;
}

function _populateRecalcSelects(nodes) {
  const opts = nodes
    .map((n) => {
      const name = n.metadata?.AEROPUERTO || n.label || n.id;
      return `<option value="${n.id}">${n.id} — ${name}</option>`;
    })
    .join("");
  const def = '<option value="">Seleccione aeropuerto…</option>';
  ["recalc-origin", "recalc-destination"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = def + opts;
  });
}

function _clearRecalcSelects() {
  const def = '<option value="">Seleccione aeropuerto…</option>';
  ["recalc-origin", "recalc-destination"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = def;
  });
}

function _updateToolbarStats() {
  const networkData = getNetworkData();
  if (!networkData) return;
  const total        = networkData.links?.length ?? 0;
  const blockedCount = getRenderer()?.links?.filter((l) => l.isBlocked).length ?? 0;
  const el = document.getElementById("total-rutas");
  if (el) el.textContent = `${total - blockedCount} activas · ${blockedCount} bloqueadas`;
}