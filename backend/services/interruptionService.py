import math
from typing import Optional, Dict, List, Tuple

class InterruptionService:
    """
    Service to handle route interruptions and automatic rerouting.
    """

    def __init__(self, load_service):
        # Inyectamos el servicio de carga entero, no solo el grafo
        self.load_service = load_service
        self.blocked_routes = []
        self.active_itinerary = None
        self.current_position = None

    # Propiedad dinámica para obtener siempre el grafo actualizado
    @property
    def graph(self):
        return self.load_service.graph

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

        if hasattr(edge_found, 'block'):
            edge_found.block()
        
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
                "distanciaKm": getattr(edge_found, 'distanciaKm', 0)
            }
        }
        
    
    def get_blocked_routes(self) -> List[dict]:
        """Devuelve la lista detallada de rutas bloqueadas."""
        return [
            {
                "origin": route["origin"],
                "destination": route["destination"],
                "reason": route["reason"],
                "distanciaKm": getattr(route["edge"], 'distanciaKm', 0)
            }
            for route in self.blocked_routes
        ]

    # ... [Mantén los métodos unblock_route, is_route_blocked, get_blocked_routes, set_active_itinerary, check_itinerary_validity, recalculate_route, handle_in_transit_interruption, clear_all_blocks tal cual los tienes] ...

    def get_network_status(self) -> dict:
        # Aquí estamos usando self.graph, que ahora llama a la propiedad dinámica
        total_routes = sum(len(v.adjacencies) for v in self.graph.vertexes) if self.graph else 0
        blocked_count = len(self.blocked_routes)
        return {
            "total_routes": total_routes,
            "active_routes": total_routes - blocked_count,
            "blocked_routes": blocked_count,
            "blocked_percentage": (blocked_count / total_routes * 100) if total_routes > 0 else 0,
            "blocked_routes_detail": self.get_blocked_routes()
        }

    def _find_vertex(self, vertex_id: str):
        # Y aquí también usamos self.graph de forma segura
        if not self.graph:
            return None
            
        for vertex in self.graph.vertexes:
            if vertex.identifier == vertex_id:
                return vertex
        return None

    def _reconstruct_path(self, pred: dict, start: str, end: str) -> List[str]:
        path = []
        current = end
        while current is not None:
            path.insert(0, current)
            current = pred.get(current)
        if not path or path[0] != start:
            return []
        return path
    
    def is_route_blocked(self, origin_id: str, destination_id: str) -> bool:
        """Verifica si una ruta específica está en la lista de bloqueos."""
        return any(r["origin"] == origin_id and r["destination"] == destination_id 
                   for r in self.blocked_routes)

    def recalculate_route(self, origin: str, destination: str) -> dict:
        """
        REQUERIMIENTO:
        recalcular automáticamente la mejor alternativa disponible
        evitando rutas bloqueadas.
        """

        if not self.graph:
            return {
                "success": False,
                "message": "Graph not loaded"
            }

        # Ejecutar Dijkstra del grafo
        dist, pred, path = self.graph.dijkstra_simple(
            self.graph,
            origin,
            destination
        )

        # Validar si realmente existe ruta
        if not path or dist[destination] == math.inf:
            return {
                "success": False,
                "message": "No alternative route available."
            }

        # Validar rutas bloqueadas dentro del path
        for i in range(len(path) - 1):

            current_origin = path[i]
            current_destination = path[i + 1]

            if self.is_route_blocked(
                current_origin,
                current_destination
            ):
                return {
                    "success": False,
                    "message": "Calculated route contains blocked segments."
                }

        return {
            "success": True,
            "path": path,
            "total_distance": dist[destination],
            "message": "New route calculated successfully."
        }
    def handle_in_transit_interruption(self, current_segment_origin: str, final_destination: str) -> dict:
        """
        REQUERIMIENTO: 'redirigirse al aeropuerto de origen del tramo y recalcular'
        """
        # 1. El avión "regresa" al origen del tramo actual
        # 2. Desde allí, buscamos una nueva ruta al destino final
        new_plan = self.recalculate_route(current_segment_origin, final_destination)
        
        return {
            "action": "RETURN_TO_ORIGIN",
            "return_airport": current_segment_origin,
            "new_itinerary": new_plan.get("path", []),
            "success": new_plan["success"],
            "message": f"Vuelo interrumpido. Regresando a {current_segment_origin} para reprogramación."
        }
        
    def unblock_route(self, origin_id: str, destination_id: str) -> dict:
        route_to_remove = None
        for route in self.blocked_routes:
            if route["origin"] == origin_id and route["destination"] == destination_id:
                route_to_remove = route
                break
        
        if route_to_remove:
            if hasattr(route_to_remove["edge"], 'unblock'):
                route_to_remove["edge"].unblock()
            self.blocked_routes.remove(route_to_remove)
            return {"success": True, "message": f"Route {origin_id} → {destination_id} reactivated"}
        return {"success": False, "message": "Route was not blocked"}

    def clear_all_blocks(self):
        """Limpia todos los bloqueos del grafo."""
        for route in self.blocked_routes:
            if hasattr(route["edge"], 'unblock'):
                route["edge"].unblock()
        self.blocked_routes = []