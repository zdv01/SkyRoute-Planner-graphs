/**
 * Block a route (simulate interruption).
 *
 * Endpoint: POST /api/interruptions/block
 * @param {string} origin
 * @param {string} destination
 * @param {string} [reason="Unknown"]
 * @returns {Promise<{ success, message, blocked_route }>}
 */
import { _apiFetch, GRAPH_API_BASE } from '../../utils/utils.js';

export async function blockRoute(origin, destination, reason = "Unknown") {
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
export async function unblockRoute(origin, destination) {
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
export async function getNetworkStatus() {
    return _apiFetch(`${GRAPH_API_BASE}/interruptions/status`);
}

/**
 * Re-calculate the best alternative route after a blockage.
 *
 * Endpoint: POST /api/interruptions/recalculate
 */
export async function recalculateRoute(origin, destination) {
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
export async function handleTransitInterruption(segmentOrigin, finalDestination) {
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
export async function clearAllBlocks() {
    return _apiFetch(`${GRAPH_API_BASE}/interruptions/clear`, { method: "POST" });
}