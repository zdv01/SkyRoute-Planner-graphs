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
import { _apiFetch, GRAPH_API_BASE } from '../../utils/utils.js';

export async function calculateOptimizedRoutes(
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
export async function generateItineraries(
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
