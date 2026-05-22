"""
Interruption Service - Manages route blocking and rerouting
Handles real-time network interruptions and recalculation
"""
import math
from typing import Optional, Dict, List, Tuple


class InterruptionService:
    """
    Service to handle route interruptions and automatic rerouting.
    
    Responsibilities:
    - Block/unblock routes (edges)
    - Detect if a traveler is in transit on a blocked route
    - Recalculate itineraries when routes are blocked
    - Track blocked routes history
    """

    def __init__(self, graph):
        """
        Initialize the interruption service with a graph.
        
        Args:
            graph: Graph instance containing the air route network
        """
        self.graph = graph
        self.blocked_routes = []  # List of blocked route tuples (origin_id, destination_id, reason)
        self.active_itinerary = None  # Current planned itinerary
        self.current_position = None  # Current traveler position

    def block_route(self, origin_id: str, destination_id: str, reason: str = "Unknown") -> dict:
        """
        Block a specific route in the network.
        
        Args:
            origin_id: Origin airport IATA code
            destination_id: Destination airport IATA code
            reason: Reason for blocking (weather, airspace closure, etc.)
            
        Returns:
            dict: Result with status and message
        """
        # Find the edge to block
        origin_vertex = self._find_vertex(origin_id)
        if not origin_vertex:
            return {
                "success": False,
                "message": f"Origin airport {origin_id} not found"
            }

        edge_found = None
        for edge in origin_vertex.adjacencies:
            if edge.destination.identifier == destination_id:
                edge_found = edge
                break

        if not edge_found:
            return {
                "success": False,
                "message": f"Route {origin_id} → {destination_id} not found"
            }

        # Block the edge
        edge_found.block()
        
        # Register the blocked route
        self.blocked_routes.append({
            "origin": origin_id,
            "destination": destination_id,
            "reason": reason,
            "edge": edge_found
        })

        return {
            "success": True,
            "message": f"Route {origin_id} → {destination_id} blocked successfully",
            "blocked_route": {
                "origin": origin_id,
                "destination": destination_id,
                "reason": reason,
                "distance": edge_found.distanceKm
            }
        }

    def unblock_route(self, origin_id: str, destination_id: str) -> dict:
        """
        Unblock a previously blocked route.
        
        Args:
            origin_id: Origin airport IATA code
            destination_id: Destination airport IATA code
            
        Returns:
            dict: Result with status and message
        """
        # Find the blocked route in our registry
        blocked_route = None
        for idx, route in enumerate(self.blocked_routes):
            if route["origin"] == origin_id and route["destination"] == destination_id:
                blocked_route = route
                route["edge"].unblock()
                self.blocked_routes.pop(idx)
                break

        if not blocked_route:
            return {
                "success": False,
                "message": f"Route {origin_id} → {destination_id} is not blocked"
            }

        return {
            "success": True,
            "message": f"Route {origin_id} → {destination_id} unblocked successfully"
        }

    def is_route_blocked(self, origin_id: str, destination_id: str) -> bool:
        """
        Check if a specific route is blocked.
        
        Args:
            origin_id: Origin airport IATA code
            destination_id: Destination airport IATA code
            
        Returns:
            bool: True if route is blocked, False otherwise
        """
        for route in self.blocked_routes:
            if route["origin"] == origin_id and route["destination"] == destination_id:
                return True
        return False

    def get_blocked_routes(self) -> List[dict]:
        """
        Get all currently blocked routes.
        
        Returns:
            List[dict]: List of blocked routes with their details
        """
        return [
            {
                "origin": route["origin"],
                "destination": route["destination"],
                "reason": route["reason"],
                "distance": route["edge"].distanceKm
            }
            for route in self.blocked_routes
        ]

    def set_active_itinerary(self, itinerary: List[str], current_position: str):
        """
        Set the current active itinerary and traveler position.
        
        Args:
            itinerary: List of airport IDs representing the planned route
            current_position: Current airport where the traveler is located
        """
        self.active_itinerary = itinerary
        self.current_position = current_position

    def check_itinerary_validity(self) -> dict:
        """
        Check if the current itinerary is still valid with blocked routes.
        
        Returns:
            dict: Validity status and affected segments
        """
        if not self.active_itinerary or len(self.active_itinerary) < 2:
            return {
                "is_valid": True,
                "message": "No active itinerary to validate"
            }

        affected_segments = []
        
        # Check each segment of the itinerary
        for i in range(len(self.active_itinerary) - 1):
            origin = self.active_itinerary[i]
            destination = self.active_itinerary[i + 1]
            
            if self.is_route_blocked(origin, destination):
                affected_segments.append({
                    "origin": origin,
                    "destination": destination,
                    "segment_index": i
                })

        if affected_segments:
            return {
                "is_valid": False,
                "message": "Itinerary contains blocked routes",
                "affected_segments": affected_segments,
                "requires_recalculation": True
            }

        return {
            "is_valid": True,
            "message": "Itinerary is valid"
        }

    def recalculate_route(
        self, 
        origin_id: str, 
        destination_id: str,
        algorithm: str = "dijkstra"
    ) -> dict:
        """
        Recalculate route avoiding blocked edges.
        
        Args:
            origin_id: Starting airport
            destination_id: Destination airport
            algorithm: Algorithm to use ('dijkstra' or 'bellman_ford')
            
        Returns:
            dict: New route information or error
        """
        # Verify both airports exist
        if not self._find_vertex(origin_id):
            return {
                "success": False,
                "message": f"Origin airport {origin_id} not found"
            }
        
        if not self._find_vertex(destination_id):
            return {
                "success": False,
                "message": f"Destination airport {destination_id} not found"
            }

        try:
            if algorithm == "dijkstra":
                dist, pred, path = self.graph.dijkstra_simple(
                    self.graph, 
                    origin_id, 
                    destination_id
                )
            else:
                all_vertices = [v.identifier for v in self.graph.vertexes]
                dist, pred = self.graph.bellmanFord(self.graph, origin_id, all_vertices)
                path = self._reconstruct_path(pred, origin_id, destination_id)

            # Validate that the path doesn't use blocked routes
            path_is_valid = True
            blocked_segment = None
            
            for i in range(len(path) - 1):
                if self.is_route_blocked(path[i], path[i + 1]):
                    path_is_valid = False
                    blocked_segment = (path[i], path[i + 1])
                    break

            if not path_is_valid:
                return {
                    "success": False,
                    "message": f"No alternative route found (blocked segment: {blocked_segment})",
                    "path": None
                }

            if dist[destination_id] == math.inf:
                return {
                    "success": False,
                    "message": "No route available to destination",
                    "path": None
                }

            return {
                "success": True,
                "message": "Route recalculated successfully",
                "path": path,
                "total_distance": dist[destination_id],
                "algorithm_used": algorithm
            }

        except Exception as e:
            return {
                "success": False,
                "message": f"Error during recalculation: {str(e)}",
                "path": None
            }

    def handle_in_transit_interruption(
        self, 
        origin_id: str, 
        destination_id: str,
        final_destination: str
    ) -> dict:
        """
        Handle the case when a traveler is in transit on a blocked route.
        Returns them to origin and recalculates.
        
        Args:
            origin_id: Origin of the interrupted segment
            destination_id: Destination of the interrupted segment
            final_destination: Final destination of the journey
            
        Returns:
            dict: Rerouting instructions
        """
        return {
            "action": "return_to_origin",
            "current_segment": {
                "origin": origin_id,
                "destination": destination_id
            },
            "return_to": origin_id,
            "message": f"Route {origin_id} → {destination_id} blocked. Returning to {origin_id}.",
            "recalculation_needed": True,
            "new_route": self.recalculate_route(origin_id, final_destination)
        }

    def get_network_status(self) -> dict:
        """
        Get overall network status including blocked routes.
        
        Returns:
            dict: Network status summary
        """
        total_routes = sum(len(v.adjacencies) for v in self.graph.vertexes)
        blocked_count = len(self.blocked_routes)
        
        return {
            "total_routes": total_routes,
            "active_routes": total_routes - blocked_count,
            "blocked_routes": blocked_count,
            "blocked_percentage": (blocked_count / total_routes * 100) if total_routes > 0 else 0,
            "blocked_routes_detail": self.get_blocked_routes()
        }

    def clear_all_blocks(self) -> dict:
        """
        Clear all blocked routes (emergency restore).
        
        Returns:
            dict: Operation result
        """
        count = len(self.blocked_routes)
        
        for route in self.blocked_routes:
            route["edge"].unblock()
        
        self.blocked_routes.clear()
        
        return {
            "success": True,
            "message": f"All {count} blocked routes have been cleared",
            "routes_cleared": count
        }

    # Private helper methods
    def _find_vertex(self, vertex_id: str):
        """Find a vertex by its identifier."""
        for vertex in self.graph.vertexes:
            if vertex.identifier == vertex_id:
                return vertex
        return None

    def _reconstruct_path(self, pred: dict, start: str, end: str) -> List[str]:
        """Reconstruct path from predecessor dictionary."""
        path = []
        current = end
        
        while current is not None:
            path.insert(0, current)
            current = pred.get(current)
            
        if path[0] != start:
            return []
            
        return path