import math
from typing import List


class InterruptionService:
    """
    Service to handle route interruptions and automatic rerouting.
    """

    def __init__(self, load_service):
        self.load_service = load_service
        self.blocked_routes = []

    # Dynamic property — always returns the currently loaded graph
    @property
    def graph(self):
        return self.load_service.graph

    # ════════════════════════════════════════════════════════════
    # Block / Unblock
    # ════════════════════════════════════════════════════════════

    def block_route(self, origin_id: str, destination_id: str, reason: str = "Unknown") -> dict:
        origin_vertex = self._find_vertex(origin_id)
        if not origin_vertex:
            return {"success": False, "message": f"Origin airport {origin_id} not found"}

        edge_found = None
        for edge in origin_vertex.adjacencies:
            if edge.destination.identifier == destination_id:
                edge_found = edge
                break

        if not edge_found:
            return {"success": False, "message": f"Route {origin_id} → {destination_id} not found"}

        edge_found.block()

        self.blocked_routes.append({
            "origin": origin_id,
            "destination": destination_id,
            "reason": reason,
            "edge": edge_found,
        })

        return {
            "success": True,
            "message": f"Route {origin_id} → {destination_id} blocked successfully",
            "blocked_route": {
                "origin": origin_id,
                "destination": destination_id,
                "reason": reason,
                "distanciaKm": getattr(edge_found, "distanceKm", 0),  # FIX: was 'distanciaKm'
            },
        }

    def unblock_route(self, origin_id: str, destination_id: str) -> dict:
        route_to_remove = None
        for route in self.blocked_routes:
            if route["origin"] == origin_id and route["destination"] == destination_id:
                route_to_remove = route
                break

        if route_to_remove:
            route_to_remove["edge"].unblock()
            self.blocked_routes.remove(route_to_remove)
            return {"success": True, "message": f"Route {origin_id} → {destination_id} reactivated"}

        return {"success": False, "message": "Route was not blocked"}

    def clear_all_blocks(self):
        for route in self.blocked_routes:
            route["edge"].unblock()
        self.blocked_routes = []

    # ════════════════════════════════════════════════════════════
    # Status
    # ════════════════════════════════════════════════════════════

    def get_blocked_routes(self) -> List[dict]:
        return [
            {
                "origin": r["origin"],
                "destination": r["destination"],
                "reason": r["reason"],
                "distanciaKm": getattr(r["edge"], "distanceKm", 0),  # FIX: was 'distanciaKm'
            }
            for r in self.blocked_routes
        ]

    def get_network_status(self) -> dict:
        total_routes = sum(len(v.adjacencies) for v in self.graph.vertexes) if self.graph else 0
        blocked_count = len(self.blocked_routes)
        return {
            "total_routes": total_routes,
            "active_routes": total_routes - blocked_count,
            "blocked_routes": blocked_count,
            "blocked_percentage": (blocked_count / total_routes * 100) if total_routes > 0 else 0,
            "blocked_routes_detail": self.get_blocked_routes(),
        }

    def is_route_blocked(self, origin_id: str, destination_id: str) -> bool:
        return any(
            r["origin"] == origin_id and r["destination"] == destination_id
            for r in self.blocked_routes
        )

    # ════════════════════════════════════════════════════════════
    # Recalculate
    # dijkstra_simple (graph.py) already skips blocked edges, so
    # any path it returns is guaranteed to avoid blocked segments.
    # ════════════════════════════════════════════════════════════

    def recalculate_route(self, origin: str, destination: str) -> dict:
        if not self.graph:
            return {"success": False, "message": "Graph not loaded"}

        dist, pred, path = self.graph.dijkstra_simple(self.graph, origin, destination)

        if not path or dist.get(destination, math.inf) == math.inf:
            return {
                "success": False,
                "message": "No alternative route available — all paths are blocked.",
            }

        return {
            "success": True,
            "path": path,
            "total_distance": dist[destination],
            "message": "Alternative route calculated successfully.",
        }

    # ════════════════════════════════════════════════════════════
    # In-transit interruption
    # ════════════════════════════════════════════════════════════

    def handle_in_transit_interruption(
        self, current_segment_origin: str, final_destination: str
    ) -> dict:
        """
        The plane returns to the origin of the interrupted segment,
        then a new route is calculated from there.
        """
        new_plan = self.recalculate_route(current_segment_origin, final_destination)

        return {
            "action": "RETURN_TO_ORIGIN",
            "return_airport": current_segment_origin,
            "new_itinerary": new_plan.get("path", []),
            "success": new_plan["success"],
            "message": (
                f"Vuelo interrumpido. Regresando a {current_segment_origin} para reprogramación."
            ),
        }

    # ════════════════════════════════════════════════════════════
    # Internal helpers
    # ════════════════════════════════════════════════════════════

    def _find_vertex(self, vertex_id: str):
        if not self.graph:
            return None
        for vertex in self.graph.vertexes:
            if vertex.identifier == vertex_id:
                return vertex
        return None