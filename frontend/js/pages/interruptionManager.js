/**
 * interruptionManager.js — R4: Route interruptions
 *
 * This manager owns everything related to blocking and unblocking routes:
 *   - Wires the "Interrumpir Ruta" toolbar button
 *   - Opens and manages modal-interrumpir-ruta
 *   - Listens for edge-click events from the renderer
 *     (dispatched by graphLoadManager as "skyroute:edgeSelected")
 *   - Calls the backend to block/unblock and updates the canvas
 *
 * It does NOT touch graphLoadManager's internals directly.
 * It reads the renderer via getRenderer() only when it needs to
 * update visual state (updateEdgeState).
 *
 * Custom events consumed:
 *   "skyroute:edgeSelected"  → fill modal with the clicked edge's data
 *   "skyroute:networkReset"  → reset internal state
 *
 * @author  SkyRoute Team
 */
import {
  blockRoute,
  unblockRoute,
  getNetworkStatus,
} from "../services/graphLoadService.js";
import {
  getRenderer,
  requireNetwork,
} from "./graphLoadManager.js";
import {
  showToast2,
  openModal,
  closeAllModals,
  showLoading,
} from "../../utils/modals.js";

// ════════════════════════════════════════════════════════════
// Module state
// ════════════════════════════════════════════════════════════

/**
 * The edge the user last clicked while the modal was open.
 * Cleared on every new modal open and after a successful block.
 * @type {{ source: string, target: string, distance: number, aircrafts: string[] }|null}
 */
let _pendingBlockEdge = null;

// ════════════════════════════════════════════════════════════
// Initialisation
// ════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {

  // ── Toolbar button: "Interrumpir Ruta" ──────────────────
  // requireNetwork is imported from graphLoadManager.
  // If no network is loaded it shows a warning and does nothing.
  document
    .getElementById("btn-interrumpir-ruta")
    ?.addEventListener("click", () => {
      requireNetwork(() => {
        _pendingBlockEdge = null;
        _resetModal();
        openModal("modal-interrumpir-ruta");
        showToast2(
          "Haz clic sobre una arista en el mapa para seleccionar la ruta.",
          "info"
        );
      });
    });

  // ── Confirm block button inside the modal ───────────────
  document
    .getElementById("btn-confirmar-bloqueo")
    ?.addEventListener("click", _handleConfirmBlock);
});

// ════════════════════════════════════════════════════════════
// Custom Event listeners
// ════════════════════════════════════════════════════════════

/**
 * Fired by graphLoadManager every time the user clicks an edge in the canvas.
 * This manager only reacts when the interruption modal is currently open,
 * so edge clicks at any other time have no side effect here.
 */
document.addEventListener("skyroute:edgeSelected", (e) => {
  const modal = document.getElementById("modal-interrumpir-ruta");
  if (!modal?.classList.contains("active")) return; // modal not open → ignore

  const edge = e.detail;
  _pendingBlockEdge = edge;

  // Fill the "selected route" info block inside the modal
  const info = document.getElementById("ruta-seleccionada-info");
  if (info) {
    const aircraft = (edge.aircrafts || []).join(", ") || "–";
    info.className = "alert alert-info";
    info.innerHTML = `
      <strong>${edge.source} → ${edge.target}</strong><br>
      Distancia: ${edge.distance} km &nbsp;·&nbsp; Aeronaves: ${aircraft}
    `;
  }

  // Enable the confirm button now that we have an edge
  const btn = document.getElementById("btn-confirmar-bloqueo");
  if (btn) btn.disabled = false;
});

/**
 * Fired by graphLoadManager when the user resets the system.
 * Clear local state so stale data is not carried over.
 */
document.addEventListener("skyroute:networkReset", () => {
  _pendingBlockEdge = null;
});

// ════════════════════════════════════════════════════════════
// Block handler
// ════════════════════════════════════════════════════════════

/**
 * Called when the user clicks "Bloquear Ruta" inside the modal.
 * Sends the block request to the backend, updates the canvas visually,
 * and resets the modal state.
 */
async function _handleConfirmBlock() {
  if (!_pendingBlockEdge) return;

  const reason         = document.getElementById("motivo-bloqueo")?.value || "Otro";
  const { source, target } = _pendingBlockEdge;

  showLoading(true, `Bloqueando ruta ${source} → ${target}…`);
  try {
    await blockRoute(source, target, reason);

    // Update the canvas: the edge turns red/dashed immediately (R4 visual requirement)
    getRenderer()?.updateEdgeState(source, target, true);

    showToast2(`Ruta ${source} → ${target} bloqueada.`, "success");
    closeAllModals();
    _resetModal();
  } catch (err) {
    showToast2(`Error al bloquear: ${err.message}`, "error");
  } finally {
    showLoading(false);
  }
}

// ════════════════════════════════════════════════════════════
// Internal helpers
// ════════════════════════════════════════════════════════════

/** Reset the modal to its initial "nothing selected" state. */
function _resetModal() {
  _pendingBlockEdge = null;

  const info = document.getElementById("ruta-seleccionada-info");
  if (info) {
    info.className   = "alert alert-warning";
    info.textContent = "Ninguna ruta seleccionada";
  }

  const btn = document.getElementById("btn-confirmar-bloqueo");
  if (btn) btn.disabled = true;
}