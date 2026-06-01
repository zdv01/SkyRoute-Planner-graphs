/**
 * graphLoadService.js
 * HTTP client for all graph-related API calls to the Flask backend.
 * Mirrors the service pattern used in api-client.js (AVL project).
 *
 * Base URL: http://localhost:5000/api
 *
 * @author  SkyRoute Team
 */

const GRAPH_API_BASE = "http://localhost:5000/api";

// ════════════════════════════════════════════════════════════
// INTERNAL HELPER
// ════════════════════════════════════════════════════════════

/**
 * Minimal fetch wrapper — throws a descriptive Error on HTTP failures.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>} Parsed JSON body
 */
async function _apiFetch(url, options = {}) {
  const defaults = { headers: { "Content-Type": "application/json" } };
  const response = await fetch(url, { ...defaults, ...options });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message || body.error || `HTTP ${response.status}`);
  }
  return body;
}

// ════════════════════════════════════════════════════════════
// GRAPH LOAD  (R1)
// ════════════════════════════════════════════════════════════

/**
 * Send the raw JSON file content to the backend so it builds the
 * internal Graph structure and returns frontend-ready node/link data.
 *
 * Endpoint: POST /api/graph/load
 * @param   {Object} jsonData - Parsed content of the .json file
 * @returns {Promise<{ status, message, data: { nodes, links, config } }>}
 */
async function loadGraphFromJSON(jsonData) {
  return _apiFetch(`${GRAPH_API_BASE}/graph/load`, {
    method: "POST",
    body: JSON.stringify(jsonData),
  });
}

/**
 * Fetch full airport detail for a single node (R1 — click on node).
 *
 * Endpoint: GET /api/graph/airport/:iataCode
 * @param   {string} iataCode - e.g. "BOG"
 * @returns {Promise<Object>} Airport dict (to_dict() output)
 */
async function getAirportDetails(iataCode) {
  return _apiFetch(`${GRAPH_API_BASE}/graph/airport/${iataCode}`);
}

// ════════════════════════════════════════════════════════════
// ROUTE PERFORMANCE  (R2)
// ════════════════════════════════════════════════════════════

/**
 * Calculate the optimal route between two airports using one or more
 * optimization criteria (distance, time, cost).
 *
 * Endpoint: POST /api/routes/optimize
 * @param {string}   origin
 * @param {string}   destination
 * @param {string[]} criteria              - e.g. ["distance", "time"]
 * @param {boolean}  excludeSecondary      - Skip non-hub airports
 * @param {string[]} preferredTransports   - e.g. ["Avión Comercial"]
 * @returns {Promise<{ status, data: Object }>}
 */
async function calculateOptimizedRoutes(
  origin,
  destination,
  criteria,
  excludeSecondary,
  preferredTransports,
) {
  return _apiFetch(`${GRAPH_API_BASE}/routes/optimize`, {
    method: "POST",
    body: JSON.stringify({
      origin,
      destination,
      criteria,
      excludeSecondary,
      preferredTransports,
    }),
  });
}

/**
 * Generate automatic itineraries (max destinations within budget/time).
 *
 * Endpoint: POST /api/routes/itinerary
 * @param {string}   origin
 * @param {number}   budget            - USD
 * @param {number}   availableTime     - hours
 * @param {string[]} preferredTransports
 * @returns {Promise<{ status, data: { alternative_a, alternative_b } }>}
 */
async function generateItineraries(
  origin,
  budget,
  availableTime,
  preferredTransports,
) {
  return _apiFetch(`${GRAPH_API_BASE}/routes/itinerary`, {
    method: "POST",
    body: JSON.stringify({
      origin,
      budget,
      availableTime,
      preferredTransports,
    }),
  });
}

// ════════════════════════════════════════════════════════════
// INTERRUPTIONS  (R4)
// ════════════════════════════════════════════════════════════

/**
 * Block a route (simulate interruption).
 *
 * Endpoint: POST /api/interruptions/block
 * @param {string} origin
 * @param {string} destination
 * @param {string} [reason="Unknown"]
 * @returns {Promise<{ success, message, blocked_route }>}
 */
async function blockRoute(origin, destination, reason = "Unknown") {
  return _apiFetch(`${GRAPH_API_BASE}/interruptions/block`, {
    method: "POST",
    body: JSON.stringify({ origin, destination, reason }),
  });
}

/**
 * Re-activate a previously blocked route.
 *
 * Endpoint: POST /api/interruptions/unblock
 */
async function unblockRoute(origin, destination) {
  return _apiFetch(`${GRAPH_API_BASE}/interruptions/unblock`, {
    method: "POST",
    body: JSON.stringify({ origin, destination }),
  });
}

/**
 * Fetch global network status (blocked routes list + percentages).
 *
 * Endpoint: GET /api/interruptions/status
 */
async function getNetworkStatus() {
  return _apiFetch(`${GRAPH_API_BASE}/interruptions/status`);
}

/**
 * Re-calculate the best alternative route after a blockage.
 *
 * Endpoint: POST /api/interruptions/recalculate
 */
async function recalculateRoute(origin, destination) {
  return _apiFetch(`${GRAPH_API_BASE}/interruptions/recalculate`, {
    method: "POST",
    body: JSON.stringify({ origin, destination }),
  });
}

/**
 * Handle in-transit interruption: return to segment origin and reroute.
 *
 * Endpoint: POST /api/interruptions/transit
 */
async function handleTransitInterruption(segmentOrigin, finalDestination) {
  return _apiFetch(`${GRAPH_API_BASE}/interruptions/transit`, {
    method: "POST",
    body: JSON.stringify({ origin: segmentOrigin, finalDestination }),
  });
}

/**
 * Clear ALL blocked routes (reset the network).
 *
 * Endpoint: POST /api/interruptions/clear
 */
async function clearAllBlocks() {
  return _apiFetch(`${GRAPH_API_BASE}/interruptions/clear`, { method: "POST" });
}

// ════════════════════════════════════════════════════════════
// DYNAMIC TRAVEL  (R3)
// ════════════════════════════════════════════════════════════

/**
 * Get available next-step options from the traveller's current state.
 *
 * Endpoint: POST /api/dynamic/next-options
 * @param {Object} currentState - { current_node, initial_budget, current_budget, ... }
 */
async function getNextStepOptions(currentState) {
  return _apiFetch(`${GRAPH_API_BASE}/dynamic/next-options`, {
    method: "POST",
    body: JSON.stringify(currentState),
  });
}

/**
 * Process an action chosen by the traveller (flight, job, activity).
 *
 * Endpoint: POST /api/dynamic/process-action
 * @param {Object} actionPayload - { action_type, action_details, current_state }
 */
async function processTravelAction(actionPayload) {
  return _apiFetch(`${GRAPH_API_BASE}/dynamic/process-action`, {
    method: "POST",
    body: JSON.stringify(actionPayload),
  });
}

// ════════════════════════════════════════════════════════════
// REPORT  (R5)
// ════════════════════════════════════════════════════════════

/**
 * Generate the final travel report.
 *
 * Endpoint: POST /api/report/generate
 * @param {Object} reportPayload - { destinosVisitados, vuelosRecorridos, ... }
 */
async function generateReport(reportPayload) {
  return _apiFetch(`${GRAPH_API_BASE}/report/generate`, {
    method: "POST",
    body: JSON.stringify(reportPayload),
  });
}
