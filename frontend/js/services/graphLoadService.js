/**
 * graphLoadService.js
 * HTTP client for all graph-related API calls to the Flask backend.
 * Mirrors the service pattern used in api-client.js (AVL project).
 *
 * Base URL: http://localhost:5000/api
 *
 * @author  SkyRoute Team
 */
import { _apiFetch, GRAPH_API_BASE } from "../../utils/utils.js";

/**
 * Send the raw JSON file content to the backend so it builds the
 * internal Graph structure and returns frontend-ready node/link data.
 *
 * Endpoint: POST /api/graph/load
 * @param   {Object} jsonData - Parsed content of the .json file
 * @returns {Promise<{ status, message, data: { nodes, links, config } }>}
 */
export async function loadGraphFromJSON(jsonData) {
  return _apiFetch(`${GRAPH_API_BASE}/graph/load`, {
    method: "POST",
    body: JSON.stringify(jsonData),
  });
}

export const loadGraphFromJson = loadGraphFromJSON;

/**
 * Fetch full airport detail for a single node (R1 — click on node).
 *
 * Endpoint: GET /api/graph/airport/:iataCode
 * @param   {string} iataCode - e.g. "BOG"
 * @returns {Promise<Object>} Airport dict (to_dict() output)
 */
export async function getAirportDetails(iataCode) {
  return _apiFetch(`${GRAPH_API_BASE}/graph/airport/${iataCode}`);
}
