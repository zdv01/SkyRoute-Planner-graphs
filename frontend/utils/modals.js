/**
 * modals.js — Shared UI utilities
 * Import from here in any manager that needs modals, toasts or the loading overlay.
 * No manager should define these functions locally.
 */

// ── Toasts ────────────────────────────────────────────────

/**
 * Show a temporary toast notification.
 * Auto-creates the container if it does not exist in the DOM.
 * @param {string} message
 * @param {"success"|"error"|"warning"|"info"} [type="info"]
 * @param {number} [duration=3500]
 */
export function showToast2(message, type = "info", duration = 3500) {
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
    container.id        = "toast-container";
    container.className = "sky-toast-container";
    document.body.appendChild(container);
  }

  container.appendChild(toast);
  setTimeout(() => toast?.remove(), duration);
}

// ── Modals ────────────────────────────────────────────────

/**
 * Open a modal by its element id.
 * @param {string} id
 */
export function openModal(id) {
  document.getElementById(id)?.classList.add("active");
}

/** Close every currently open modal. */
export function closeAllModals() {
  document
    .querySelectorAll(".modal.active")
    .forEach((m) => m.classList.remove("active"));
}

// ── Loading overlay ───────────────────────────────────────

/**
 * Show or hide the full-screen loading overlay.
 * @param {boolean} visible
 * @param {string}  [text="Procesando…"]
 */
export function showLoading(visible, text = "Procesando…") {
  const overlay = document.getElementById("loading-overlay");
  const label   = document.getElementById("loading-text");
  if (!overlay) return;
  overlay.classList.toggle("active", visible);
  if (label && text) label.textContent = text;
}

// ── Global modal behaviour ────────────────────────────────

/**
 * Wire close buttons and backdrop clicks for ALL modals in the page.
 * Call once during app initialisation (graphLoadManager's DOMContentLoaded).
 */
export function initModalBehavior() {
  // .btn-close and .btn-cancel always close every open modal
  document
    .querySelectorAll(".btn-close, .btn-cancel")
    .forEach((btn) => btn.addEventListener("click", closeAllModals));

  // Clicking the dark backdrop also closes the modal
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAllModals();
    });
  });
}