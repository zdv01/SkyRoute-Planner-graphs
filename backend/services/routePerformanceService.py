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

        aircraft_config = self.graph_service.config.get("aeronaves", {})
        flight_overhead_min = self.graph_service.config.get("overheadVueloMin", 0)

        try:
            # Alt A: explore unconstrained by time → finds every budget-feasible path
            paths_a = graph.find_itineraries_dfs(
                graph, origin_id, initial_budget, None, preferred_transports, constraint="budget",
                aircraft_config=aircraft_config, flight_overhead_min=flight_overhead_min,
            )
            # Alt B: explore unconstrained by cost → finds every time-feasible path
            paths_b = graph.find_itineraries_dfs(
                graph, origin_id, None, available_time_minutes, preferred_transports, constraint="time",
                aircraft_config=aircraft_config, flight_overhead_min=flight_overhead_min,
            )
        except AttributeError:
            raise Exception("El método 'find_itineraries_dfs' no se encontró en la clase Graph.")

        # Alt A: maximize destinations → maximize transport diversity → minimize cost
        alt_a = max(
            (
                p for p in paths_a
                if p["destinations_count"] > 0
                and p["cost"] <= initial_budget
            ),
            key=lambda x: (x["destinations_count"], len(x["transports"]), -x["cost"]),
            default=None,
        )

        # Alt B: maximize destinations → maximize transport diversity → minimize time
        alt_b = max(
            (
                p for p in paths_b
                if p["destinations_count"] > 0
                and p["time"] <= available_time_minutes
            ),
            key=lambda x: (x["destinations_count"], len(x["transports"]), -x["time"]),
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
            stay_cost = seg.get("accommodation_cost", 0) + seg.get("alimentation_cost", 0)
            segments_output.append({
                "from": seg["from"],
                "to": seg["to"],
                "transport": seg["transport"],
                "flight_cost_usd": round(seg.get("flight_cost", 0), 2),
                "stay_cost_usd": round(stay_cost, 2),
                "activities_cost_usd": round(seg.get("activities_cost", 0), 2),
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
        Shows flight duration, minimum stay, and totals per segment in hours."""
        if not path_data:
            return None

        accumulated_minutes = 0
        segments_output = []
        for seg in path_data["segments"]:
            flight_min = seg.get("flight_time_minutes", seg["time_minutes"])
            stay_min = seg.get("min_stay_minutes", 0)
            total_min = flight_min + stay_min
            accumulated_minutes += total_min
            segments_output.append({
                "from": seg["from"],
                "to": seg["to"],
                "transport": seg["transport"],
                "flight_duration_hours": round(flight_min / 60, 2),
                "min_stay_hours": round(stay_min / 60, 2),
                "segment_total_hours": round(total_min / 60, 2),
                "accumulated_time_hours": round(accumulated_minutes / 60, 2),
            })

        return {
            "sequence": path_data["path"],
            "total_destinations": path_data["destinations_count"],
            "total_time_hours": round(path_data["time"] / 60, 2),
            "segments": segments_output,
        }