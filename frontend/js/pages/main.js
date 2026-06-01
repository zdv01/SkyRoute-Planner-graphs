/**
 * main.js  — SkyRoute Planner application entry point.
 *
 * This file is the LAST script loaded by app.html. Its only jobs are:
 *   1. Confirm that all required modules loaded without errors.
 *   2. Register global keyboard shortcuts.
 *   3. Expose the shared module references that sub-managers need
 *      (renderer, networkData) through a single global namespace.
 *
 * Actual initialization of each module is done inside that module's
 * own DOMContentLoaded listener so load order is self-contained.
 *
 * Script load order (app.html):
 *   1. graphLoadService.js   — API fetch helpers
 *   2. graphRenderer.js      — GraphRenderer class
 *   3. graphLoadManager.js   — R1: load, visualize, interruptions
 *   4. routePerformanceManager.js — R2: itinerary planning (next sprint)
 *   5. dynamicTravelManager.js    — R3: step-by-step travel (next sprint)
 *   6. interruptionManager.js     — R4: in-transit reroute (next sprint)
 *   7. reportManager.js           — R5: final report (next sprint)
 *   8. main.js  ← YOU ARE HERE
 *
 * @author  SkyRoute Team
 */

// ════════════════════════════════════════════════════════════
// STARTUP CHECK
// ════════════════════════════════════════════════════════════

(function bootstrap() {
  const required = [
    { name: "GraphRenderer",  ref: typeof GraphRenderer  !== "undefined" },
    { name: "loadGraphFromJSON", ref: typeof loadGraphFromJSON !== "undefined" },
    { name: "showToast",      ref: typeof showToast      !== "undefined" },
    { name: "showLoading",    ref: typeof showLoading    !== "undefined" },
  ];

  const missing = required.filter((r) => !r.ref).map((r) => r.name);

  if (missing.length) {
    console.error(
      `[SkyRoute] ⚠ Missing dependencies: ${missing.join(", ")}.\n` +
      "Check the script load order in app.html."
    );
  } else {
    console.info("[SkyRoute] ✓ All core modules loaded.");
  }
})();

// ════════════════════════════════════════════════════════════
// GLOBAL KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════════

document.addEventListener("keydown", (e) => {
  // ESC: close any open modal
  if (e.key === "Escape") {
    document.querySelectorAll(".modal.active")
      .forEach((m) => m.classList.remove("active"));
  }

  // Ctrl + 0 / Home: reset zoom to fit
  if ((e.ctrlKey || e.metaKey) && e.key === "0") {
    e.preventDefault();
    // renderer is initialized inside graphLoadManager — reference via window
    if (typeof renderer !== "undefined" && renderer) renderer.resetView();
  }

  // Ctrl + +/-: zoom in/out
  if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
    e.preventDefault();
    if (typeof renderer !== "undefined" && renderer) renderer.zoomIn();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "-") {
    e.preventDefault();
    if (typeof renderer !== "undefined" && renderer) renderer.zoomOut();
  }
});

// ════════════════════════════════════════════════════════════
// GLOBAL CONFIG DEFAULTS
// Consumed by routePerformanceManager / dynamicTravelManager
// when the user hasn't opened the config modal yet.
// ════════════════════════════════════════════════════════════

window._skyRouteConfig = window._skyRouteConfig || {
  aeronaves: {
    "Avión Comercial": { costoKm: 0.18, tiempoKm: 0.7  },
    "Avión Regional":  { costoKm: 0.25, tiempoKm: 1.1  },
    "Hélice":          { costoKm: 0.12, tiempoKm: 2.5  },
  },
  intervaloAlojamiento:  20,
  intervaloAlimentacion: 8,
  presupuestoMinimoPorc: 35,
};

console.info("[SkyRoute] Application ready.");