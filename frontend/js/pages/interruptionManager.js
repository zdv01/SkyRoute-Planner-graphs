/**
 * interruptionManager.js — R4: Route interruptions
 *
 * Flow:
 *  1. "Interrumpir Ruta" → open modal, populate <select> with all active routes
 *  2. User picks a route (e.g. ASU → MVD). Flight animation keeps running behind modal.
 *  3. Confirm → block on backend, edge turns red/dashed on canvas.
 *  4. If the animation is flying on that exact segment → stop it, snap plane
 *     back to segment origin, dispatch skyroute:flightInterrupted.
 *  5. Manager modal: list blocked routes, unblock individually, recalculate alternative.
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

  // ── Toolbar: "Interrumpir Ruta" ──────────────────────────
  document
    .getElementById("btn-interrumpir-ruta")
    ?.addEventListener("click", () =>
      requireNetwork(() => {
        _populateRouteSelect();   // fill dropdown with current active routes
        _resetBlockModal();
        openModal("modal-interrumpir-ruta");
      }),
    );

  // ── Enable confirm button only when a route is chosen ────
  document
    .getElementById("select-ruta-bloquear")
    ?.addEventListener("change", (e) => {
      const btn = document.getElementById("btn-confirmar-bloqueo");
      if (btn) btn.disabled = !e.target.value;
    });

  // ── Confirm block ────────────────────────────────────────
  document
    .getElementById("btn-confirmar-bloqueo")
    ?.addEventListener("click", _handleConfirmBlock);

  // ── Open manager from block modal ────────────────────────
  document.getElementById("btn-ver-bloqueos")?.addEventListener("click", () => {
    closeAllModals();
    _openManager();
  });

  // ── Recalculate (inside manager modal) ───────────────────
  document
    .getElementById("btn-recalcular-ruta")
    ?.addEventListener("click", _handleRecalculate);

  // ── Clear all blocks (inside manager modal) ──────────────
  document
    .getElementById("btn-limpiar-todos-bloqueos")
    ?.addEventListener("click", _handleClearAll);

  // ── Sync selects when graph loads / resets ───────────────
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

  const links = getNetworkData()?.links ?? [];

  // Only list routes that are not already blocked
  const active = links
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
          `<option value="${l.source}|${l.target}">
            ${l.source} → ${l.target} &nbsp; (${l.distance ?? "?"} km)
          </option>`,
      )
      .join("");
}

// ════════════════════════════════════════════════════════════
// Block handler
// ════════════════════════════════════════════════════════════

async function _handleConfirmBlock() {
  const sel    = document.getElementById("select-ruta-bloquear");
  const value  = sel?.value ?? "";
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

    // 1. Visual update on canvas: edge turns red/dashed
    getRenderer()?.updateEdgeState(source, target, true);
    _updateToolbarStats();

    // 2. In-transit check: is the animation currently on this segment?
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
// In-transit interruption
// If the flight animation is currently flying the blocked segment,
// stop it, snap the plane back to the segment origin, and notify
// dynamicTravelManager so it can unlock and re-render the panel.
// ════════════════════════════════════════════════════════════

function _checkInTransitInterruption(blockedOrigin, blockedDest) {
  const renderer = getRenderer();
  const anim     = renderer?._flightAnim;
  if (!anim?.active) return;

  const currentSeg = anim.segments?.[anim.currentSeg];
  if (!currentSeg) return;
  if (currentSeg.from !== blockedOrigin || currentSeg.to !== blockedDest) return;

  // The plane is on the blocked segment → interrupt
  const finalDest = anim.segments.at(-1)?.to ?? "";

  anim.active          = false;
  renderer._flightAnim = null;
  renderer.setCurrentNode(blockedOrigin);
  renderer.clearHighlight();

  // Notify other modules (dynamicTravelManager listens to this)
  document.dispatchEvent(
    new CustomEvent("skyroute:flightInterrupted", {
      detail: { returnAirport: blockedOrigin, finalDestination: finalDest },
    }),
  );

  showToast2(
    `✈ Vuelo interrumpido en tránsito. El avión regresa a ${blockedOrigin}.`,
    "warning",
    7000,
  );

  // Pre-fill the recalculate form and open the manager after a short pause
  setTimeout(() => {
    const oSel = document.getElementById("recalc-origin");
    const dSel = document.getElementById("recalc-destination");
    if (oSel) oSel.value = blockedOrigin;
    if (dSel && finalDest) dSel.value = finalDest;
    _openManager(true);
  }, 900);
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

// ── Exposed globals for inline onclick handlers ───────────────

window._skyRouteUnblock = async function (origin, destination) {
  showLoading(true, `Desbloqueando ${origin} → ${destination}…`);
  try {
    const result = await unblockRoute(origin, destination);
    if (!result.success) {
      showToast2(result.message || "Error al desbloquear.", "error");
      return;
    }
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
      showToast2(
        result.message || "No existe ruta alternativa disponible.",
        "warning",
      );
      return;
    }

    getRenderer()?.highlightPath(result.path);
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