/**
 * Generate the final travel report.
 *
 * Endpoint: POST /api/report/generate
 * @param {Object} reportPayload - { destinosVisitados, vuelosRecorridos, ... }
 */
import { _apiFetch, GRAPH_API_BASE } from '../../utils/utils.js';

export async function generateReport(reportPayload) {
    return _apiFetch(`${GRAPH_API_BASE}/report/generate`, {
        method: "POST",
        body: JSON.stringify(reportPayload),
    });
}
