class DynamicTravelService:
    def __init__(self, load_service):
        self.load_service = load_service

    def _get_config(self):
        config = self.load_service.config
        return {
            "aeronaves": config.get("aeronaves", {}),
            "presupuesto_minimo_porc": config.get("presupuestoMinimoPorc", 35) / 100,
            "intervalo_alojamiento": config.get("intervaloAlojamiento", 20),
            "intervalo_alimentacion": config.get("intervaloAlimentacion", 8),
            "overhead_vuelo": config.get("overheadVueloMin", 0),
        }

    def get_next_step_options(self, current_state):
        """
        Calcula las opciones disponibles desde el estado actual:
        Vuelos, Trabajos (si aplica) y Actividades.
        """
        graph = self.load_service.graph
        cfg = self._get_config()

        origin_id = current_state.get("current_node")
        initial_budget = current_state.get("initial_budget")
        current_budget = current_state.get("current_budget")
        time_since_sleep = current_state.get("time_since_sleep", 0)
        time_since_food = current_state.get("time_since_food", 0)
        visited = current_state.get("visited", [])

        vertex = next((v for v in graph.vertexes if v.identifier == origin_id), None)
        if not vertex:
            return {"error": "Nodo no encontrado"}

        vertex_data = vertex.to_dict() if hasattr(vertex, "to_dict") else {}

        # 1. TRABAJOS (solo si presupuesto < umbral configurado)
        available_jobs = []
        if initial_budget and current_budget < (initial_budget * cfg["presupuesto_minimo_porc"]):
            available_jobs = vertex_data.get("trabajos", [])

        # 2. ACTIVIDADES opcionales del nodo actual
        activities = vertex_data.get("actividades", [])

        # 3. VUELOS con cálculo de costos desde configuración del JSON
        aeronaves = cfg["aeronaves"]
        overhead = cfg["overhead_vuelo"]
        intervalo_alimentacion = cfg["intervalo_alimentacion"]
        intervalo_alojamiento = cfg["intervalo_alojamiento"]

        flight_options = []
        for edge in vertex.adjacencies:
            if getattr(edge, "is_blocked", False):
                continue

            dest = edge.destination
            dist_km = getattr(edge, "distanceKm", 0)
            aeronaves_disponibles = getattr(edge, "aircrafts", [])
            is_subsidized = getattr(edge, "routeSubsidized", False)

            for plane_type in aeronaves_disponibles:
                perf = aeronaves.get(plane_type, {})
                costo_km = perf.get("costoKm", 0.12)
                tiempo_km = perf.get("tiempoKm", 0.4)

                flight_time_mins = dist_km * tiempo_km + overhead
                flight_cost = 0 if is_subsidized else dist_km * costo_km

                # Gastos obligatorios durante el vuelo
                extra_costs = 0
                temp_time_food = time_since_food + (flight_time_mins / 60)
                temp_time_sleep = time_since_sleep + (flight_time_mins / 60)

                if temp_time_food >= intervalo_alimentacion:
                    extra_costs += vertex_data.get(
                        "costoAlimentacion", getattr(vertex, "alimentationCost", 0)
                    )
                if temp_time_sleep >= intervalo_alojamiento:
                    extra_costs += vertex_data.get(
                        "costoAlojamiento", getattr(vertex, "accommodationCost", 0)
                    )

                flight_options.append(
                    {
                        "to": dest.identifier,
                        "to_name": getattr(dest, "name", dest.identifier),
                        "aircraft": plane_type,
                        "flight_cost": round(flight_cost, 2),
                        "mandatory_extra_costs": round(extra_costs, 2),
                        "total_step_cost": round(flight_cost + extra_costs, 2),
                        "flight_time_mins": round(flight_time_mins, 1),
                        "distance_km": dist_km,
                        "subsidized": is_subsidized,
                        "already_visited": dest.identifier in visited,
                    }
                )

        return {
            "current_airport": vertex.identifier,
            "current_airport_name": getattr(vertex, "name", vertex.identifier),
            "can_work": len(available_jobs) > 0,
            "jobs": available_jobs,
            "activities": activities,
            "flights": flight_options,
        }

    def suggest_best_next_move(self, options):
        """
        Heurística: sugiere el destino no visitado con menor costo de tramo.
        """
        flights = options.get("flights", [])
        if not flights:
            return None

        unvisited = [f for f in flights if not f.get("already_visited")]
        candidates = unvisited if unvisited else flights
        return min(candidates, key=lambda x: x["total_step_cost"])

    def process_user_action(self, data):
        """
        Procesa la acción elegida por el usuario (volar, trabajar, actividad)
        aplicando las reglas de negocio y devuelve el nuevo estado actualizado.
        """
        cfg = self._get_config()
        action_type = data.get("action_type")
        action_details = data.get("action_details", {})
        state = data.get("current_state", {})

        current_budget = state.get("current_budget", 0)
        time_since_sleep = state.get("time_since_sleep", 0)
        time_since_food = state.get("time_since_food", 0)
        total_time_mins = state.get("total_time_mins", 0)
        current_node = state.get("current_node")
        visited = list(state.get("visited", []))
        history = list(state.get("history", []))

        if action_type == "flight":
            destination = action_details.get("to")
            flight_cost = action_details.get("flight_cost", 0)
            flight_time_mins = action_details.get("flight_time_mins", 0)
            mandatory_costs = action_details.get("mandatory_extra_costs", 0)

            total_cost = flight_cost + mandatory_costs
            if current_budget < total_cost:
                return {"error": "Presupuesto insuficiente para este vuelo."}

            current_budget -= total_cost
            total_time_mins += flight_time_mins
            flight_time_hours = flight_time_mins / 60.0

            if time_since_sleep + flight_time_hours >= cfg["intervalo_alojamiento"]:
                time_since_sleep = 0
            else:
                time_since_sleep += flight_time_hours

            if time_since_food + flight_time_hours >= cfg["intervalo_alimentacion"]:
                time_since_food = 0
            else:
                time_since_food += flight_time_hours

            visited.append(current_node)
            history.append(
                {
                    "type": "flight",
                    "from": current_node,
                    "to": destination,
                    "cost": round(total_cost, 2),
                    "time_mins": round(flight_time_mins, 1),
                    "aircraft": action_details.get("aircraft"),
                }
            )
            current_node = destination

        elif action_type == "job":
            tarifa = action_details.get("tarifaHora", 0)
            horas = action_details.get("horas", 0)
            max_horas = action_details.get("maxHoras", horas)

            if horas > max_horas:
                return {"error": f"No puedes trabajar más de {max_horas} horas en este empleo."}

            ingreso = tarifa * horas
            current_budget += ingreso
            total_time_mins += horas * 60
            time_since_sleep += horas
            time_since_food += horas

            history.append(
                {
                    "type": "job",
                    "location": current_node,
                    "name": action_details.get("nombre"),
                    "earned": round(ingreso, 2),
                    "hours": horas,
                }
            )

        elif action_type == "activity":
            costo = action_details.get("costoUSD", 0)
            duracion = action_details.get("duracionMin", 0)

            if current_budget < costo:
                return {"error": "Presupuesto insuficiente para esta actividad."}

            current_budget -= costo
            total_time_mins += duracion
            duracion_horas = duracion / 60.0
            time_since_sleep += duracion_horas
            time_since_food += duracion_horas

            history.append(
                {
                    "type": "activity",
                    "location": current_node,
                    "name": action_details.get("nombre"),
                    "cost": round(costo, 2),
                    "time_mins": duracion,
                }
            )
        else:
            return {"error": "Tipo de acción no válido ('flight', 'job', 'activity')."}

        new_state = {
            "initial_budget": state.get("initial_budget"),
            "current_node": current_node,
            "current_budget": round(current_budget, 2),
            "time_since_sleep": round(time_since_sleep, 3),
            "time_since_food": round(time_since_food, 3),
            "total_time_mins": round(total_time_mins, 1),
            "visited": visited,
            "history": history,
        }

        return {"status": "success", "new_state": new_state}
