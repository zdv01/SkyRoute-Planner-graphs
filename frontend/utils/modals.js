// MODALS AND TOASTS

function showToast(message, type = "info", duration = 3500) {
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