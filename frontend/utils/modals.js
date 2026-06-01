// MODALS AND TOASTS

export function showToast(message, type = "info", duration = 3500) {
    const icons = { success: "✓", error: "✗", warning: "⚠", info: "ℹ" };
    const toast = document.createElement("div");
    toast.className = `sky-toast ${type}`;
    console.log("TOAST DEFINIDO");
    toast.innerHTML = `
        <span class="sky-toast-icon">${icons[type] ?? "ℹ"}</span>
        <span class="sky-toast-message">${message}</span>
        <button class="sky-toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    document.getElementById("toast-container").appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

/**
 * Display a temporary toast notification.
 * @param {string} message
 * @param {"success"|"error"|"warning"|"info"} [type]
 * @param {number} [duration]
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
    container.id = "toast-container";
    container.style.cssText =
      "position:fixed;top:90px;right:20px;z-index:2000;display:flex;flex-direction:column;gap:10px;max-width:360px;";
    document.body.appendChild(container);
  }

  container.appendChild(toast);
  setTimeout(() => toast?.remove(), duration);
}