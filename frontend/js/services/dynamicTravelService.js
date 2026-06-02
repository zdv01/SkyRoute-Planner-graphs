/**
 * Get available next-step options from the traveller's current state.
 *
 * Endpoint: POST /api/dynamic/next-options
 * @param {Object} currentState - { current_node, initial_budget, current_budget, ... }
 */
import { _apiFetch, GRAPH_API_BASE } from '../../utils/utils.js';

export async function getNextStepOptions(currentState) {
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
export async function processTravelAction(actionPayload) {
    return _apiFetch(`${GRAPH_API_BASE}/dynamic/process-action`, {
        method: "POST",
        body: JSON.stringify(actionPayload),
    });
}