import math

class RoutePerformanceService:
    def __init__(self, graph_load_service):
        self.graph_service = graph_load_service

    # =========================================================================
    # REQUERIMIENTO: RUTAS ÓPTIMAS PUNTO A PUNTO (Multicriterio)
    # =========================================================================
    def calculate_optimized_routes(self, origin_id, destination_id, criteria, exclude_secondary, preferred_transports):
        graph = self.graph_service.graph
        
        # 1. Filtro: Excluir aeropuertos secundarios
        allowed_vertices = None
        if exclude_secondary:
            # Buscamos en 'isHub' o dentro del diccionario 'metadata' si es hub
            allowed_vertices = {
                v.identifier for v in graph.vertexes 
                if getattr(v, 'isHub', getattr(v, 'metadata', {}).get('esHub', True))
            }

        results = {}
        
        # 2. Calcular ruta por cada criterio
        for criterion in criteria:
            def get_custom_weight(edge):
                # Filtro de transporte ajustado al JSON ("aircrafts" como lista)
                edge_transports = getattr(edge, 'aircrafts', [getattr(edge, 'transport_type', 'Aéreo')])
                
                # Validar intersección: ¿la arista tiene al menos uno de los transportes preferidos?
                if preferred_transports:
                    if not any(t in edge_transports for t in preferred_transports):
                        return math.inf

                # Nodos destino y su metadata
                target = edge.destination
                metadata = getattr(target, 'metadata', {})

                # Cálculo de peso dinámico según el criterio
                if criterion == 'distance':
                    return getattr(edge, 'distance', 0)
                
                elif criterion == 'time':
                    return getattr(edge, 'time', getattr(edge, 'distance', 0) * 0.1)
                
                elif criterion == 'cost':
                    # Costo base del vuelo + Costos del aeropuerto destino
                    base = getattr(edge, 'cost', getattr(edge, 'distance', 0) * 0.2)
                    acc = metadata.get('costoAlojamiento', 0)
                    ali = metadata.get('costoAlimentacion', 0)
                    return base + acc + ali
                
                return 0

            try:
                # El algoritmo Dijkstra fue ajustado en el Grafo para soportar weight_function y allowed_vertices
                total_weight, path = graph.dijkstra_multi_criteria(
                    graph, origin_id, destination_id, get_custom_weight, allowed_vertices
                )
                
                if path and len(path) > 1 and total_weight != math.inf:
                    results[criterion] = {
                        "path": path,
                        "total_metric": total_weight
                    }
            except AttributeError:
                raise Exception("El método 'dijkstra_multi_criteria' no se encontró en la clase Graph.")

        return results

    # =========================================================================
    # REQUERIMIENTO 2.2: GENERACIÓN AUTOMÁTICA DE ITINERARIOS
    # =========================================================================
    def generate_automatic_itineraries(self, origin_id, initial_budget, available_time, preferred_transports):
        graph = self.graph_service.graph
        
        # 1. Delegamos el cálculo algorítmico (DFS) al Grafo
        try:
            all_paths = graph.find_itineraries_dfs(graph, origin_id, initial_budget, available_time, preferred_transports)
        except AttributeError:
            raise Exception("El método 'find_itineraries_dfs' no se encontró en la clase Graph.")

        if not all_paths:
            return {"alternative_a": None, "alternative_b": None}

        # 2. Reglas de Negocio para seleccionar las mejores rutas
        
        # Alternativa A: Maximizar destinos, minimizando costo (Prioriza budget)
        alt_a = max(
            (p for p in all_paths if p["cost"] <= initial_budget),
            key=lambda x: (x["destinations_count"], -x["cost"]),
            default=None
        )

        # Alternativa B: Maximizar destinos, minimizando tiempo (Prioriza tiempo)
        alt_b = max(
            (p for p in all_paths if p["time"] <= available_time),
            key=lambda x: (x["destinations_count"], -x["time"]),
            default=None
        )

        # Evitamos devolver itinerarios donde no hubo desplazamientos reales
        if alt_a and alt_a["destinations_count"] == 0: alt_a = None
        if alt_b and alt_b["destinations_count"] == 0: alt_b = None

        return {
            "alternative_a": self._format_itinerary_output(alt_a),
            "alternative_b": self._format_itinerary_output(alt_b)
        }

    # =========================================================================
    # UTILS
    # =========================================================================
    def _format_itinerary_output(self, path_data):
        if not path_data:
            return None
        return {
            "sequence": path_data["path"],
            "total_destinations": path_data["destinations_count"],
            "total_cost_usd": round(path_data["cost"], 2),
            "total_time_hours": round(path_data["time"], 2)
        }