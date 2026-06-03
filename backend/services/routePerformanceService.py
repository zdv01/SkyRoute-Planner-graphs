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
    def generate_automatic_itineraries(self, origin_id, initial_budget, available_time_hours, preferred_transports):
        graph = self.graph_service.graph

        # Frontend sends hours; graph works internally in minutes
        available_time_minutes = available_time_hours * 60

        try:
            # Alt A: explore unconstrained by time → finds every budget-feasible path
            paths_a = graph.find_itineraries_dfs(
                graph, origin_id, initial_budget, None, preferred_transports, constraint="budget"
            )
            # Alt B: explore unconstrained by cost → finds every time-feasible path
            paths_b = graph.find_itineraries_dfs(
                graph, origin_id, None, available_time_minutes, preferred_transports, constraint="time"
            )
        except AttributeError:
            raise Exception("El método 'find_itineraries_dfs' no se encontró en la clase Graph.")

        def uses_all_transports(path_data):
            """Requirement: each preferred transport type must appear at least once."""
            if not preferred_transports:
                return True
            return all(t in path_data["transports"] for t in preferred_transports)

        # Alternativa A: maximize destinations, then minimize cost; all transports used
        alt_a = max(
            (
                p for p in paths_a
                if p["destinations_count"] > 0
                and p["cost"] <= initial_budget
                and uses_all_transports(p)
            ),
            key=lambda x: (x["destinations_count"], -x["cost"]),
            default=None,
        )

        # Alternativa B: maximize destinations, then minimize time; all transports used
        alt_b = max(
            (
                p for p in paths_b
                if p["destinations_count"] > 0
                and p["time"] <= available_time_minutes
                and uses_all_transports(p)
            ),
            key=lambda x: (x["destinations_count"], -x["time"]),
            default=None,
        )

        return {
            "alternative_a": self._format_alt_a(alt_a),
            "alternative_b": self._format_alt_b(alt_b),
        }

    # =========================================================================
    # UTILS
    # =========================================================================
    def _format_alt_a(self, path_data):
        """Alternative A: maximize destinations, minimize cost.
        Shows cost per segment and accumulated cost."""
        if not path_data:
            return None

        accumulated_cost = 0
        segments_output = []
        for seg in path_data["segments"]:
            accumulated_cost += seg["cost"]
            segments_output.append({
                "from": seg["from"],
                "to": seg["to"],
                "transport": seg["transport"],
                "segment_cost_usd": round(seg["cost"], 2),
                "accumulated_cost_usd": round(accumulated_cost, 2),
            })

        return {
            "sequence": path_data["path"],
            "total_destinations": path_data["destinations_count"],
            "total_cost_usd": round(path_data["cost"], 2),
            "segments": segments_output,
        }

    def _format_alt_b(self, path_data):
        """Alternative B: maximize destinations in least time.
        Shows duration per segment and accumulated time in hours."""
        if not path_data:
            return None

        accumulated_minutes = 0
        segments_output = []
        for seg in path_data["segments"]:
            accumulated_minutes += seg["time_minutes"]
            segments_output.append({
                "from": seg["from"],
                "to": seg["to"],
                "transport": seg["transport"],
                "segment_duration_hours": round(seg["time_minutes"] / 60, 2),
                "accumulated_time_hours": round(accumulated_minutes / 60, 2),
            })

        return {
            "sequence": path_data["path"],
            "total_destinations": path_data["destinations_count"],
            "total_time_hours": round(path_data["time"] / 60, 2),
            "segments": segments_output,
        }