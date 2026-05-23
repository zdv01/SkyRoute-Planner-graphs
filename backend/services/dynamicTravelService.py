import math

class DynamicTravelService:
    def __init__(self, load_service):
        self.load_service = load_service
        # Valores por defecto del sistema
        self.AIRCRAFT_DATA = {
            "Avión Comercial": {"cost_km": 0.18, "time_km": 0.7},
            "Avión Regional": {"cost_km": 0.25, "time_km": 1.1},
            "Hélice": {"cost_km": 0.12, "time_km": 2.5}
        }

    def get_next_step_options(self, current_state):
        """
        Calcula las opciones disponibles desde el estado actual:
        Vuelos, Trabajos (si aplica) y Actividades.
        """
        # CORRECCIÓN 1: Acceder al atributo .graph en lugar del método get_graph()
        graph = self.load_service.graph
        
        origin_id = current_state.get("current_node")
        initial_budget = current_state.get("initial_budget")
        current_budget = current_state.get("current_budget")
        time_since_sleep = current_state.get("time_since_sleep", 0) # en horas
        time_since_food = current_state.get("time_since_food", 0)   # en horas
        
        vertex = next((v for v in graph.vertexes if v.identifier == origin_id), None)
        if not vertex:
            return {"error": "Nodo no encontrado"}

        # CORRECCIÓN 2: Obtener la info del aeropuerto usando to_dict() (según el LoadService)
        # Por seguridad también soportamos si los atributos están directos en el objeto
        vertex_data = vertex.to_dict() if hasattr(vertex, 'to_dict') else {}

        # 1. TRABAJOS (Solo si presupuesto < 35%)
        available_jobs = []
        if current_budget < (initial_budget * 0.35):
            available_jobs = vertex_data.get("trabajos", getattr(vertex, 'trabajos', []))

        # 2. ACTIVIDADES (Opcionales en el nodo actual)
        activities = vertex_data.get("actividades", getattr(vertex, 'actividades', []))

        # 3. VUELOS Y CÁLCULO DE COSTOS DINÁMICOS
        flight_options = []
        for edge in vertex.adjacencies:
            dest = edge.destination
            
            # CORRECCIÓN 3: Acceder a las propiedades reales de Edge como se instancian en GraphLoadService
            dist_km = getattr(edge, 'distanceKm', 0)
            aeronaves_disponibles = getattr(edge, 'aircrafts', [])
            costo_base = getattr(edge, 'baseCost', None)
            
            # Analizar cada aeronave disponible en la ruta
            for plane_type in aeronaves_disponibles:
                perf = self.AIRCRAFT_DATA.get(plane_type, self.AIRCRAFT_DATA["Hélice"])
                
                flight_time_mins = dist_km * perf["time_km"]
                flight_cost = dist_km * perf["cost_km"]
                
                # Regla de rutas subsidiadas (costo 0)
                if costo_base == 0:
                    # El viajero no puede tomar más del 20% de la distancia total (se asume validación de tramo)
                    flight_cost = 0

                # Gastos Obligatorios durante o después del vuelo
                extra_costs = 0
                temp_time_food = time_since_food + (flight_time_mins / 60)
                
                # Alimentación cada 8h
                if temp_time_food >= 8:
                    extra_costs += vertex_data.get("costoAlimentacion", getattr(vertex, 'costoAlimentacion', 0))
                
                # Alojamiento cada 20h
                if time_since_sleep >= 20:
                    extra_costs += vertex_data.get("costoAlojamiento", getattr(vertex, 'costoAlojamiento', 0))

                flight_options.append({
                    "to": dest.identifier,
                    "aircraft": plane_type,
                    "flight_cost": flight_cost,
                    "mandatory_extra_costs": extra_costs,
                    "total_step_cost": flight_cost + extra_costs,
                    "flight_time_mins": flight_time_mins,
                    "distance_km": dist_km
                })

        return {
            "current_airport": vertex.identifier,
            "can_work": len(available_jobs) > 0,
            "jobs": available_jobs,
            "activities": activities,
            "flights": flight_options
        }

    def suggest_best_next_move(self, options):
        """
        Heurística: Sugiere el destino que maximice destinos (no visitados) 
        con el menor costo de tramo.
        """
        if not options.get("flights"):
            return None
        
        # Ordenar por menor costo total de tramo
        sorted_flights = sorted(options["flights"], key=lambda x: x["total_step_cost"])
        return sorted_flights[0]
    
    def process_user_action(self, data):
        """
        Procesa la acción elegida por el usuario (volar, trabajar, actividad)
        aplicando las reglas de negocio y devuelve el nuevo estado actualizado.
        """
        action_type = data.get("action_type")
        action_details = data.get("action_details", {})
        state = data.get("current_state", {})

        # Extraer valores del estado actual
        current_budget = state.get("current_budget", 0)
        time_since_sleep = state.get("time_since_sleep", 0)
        time_since_food = state.get("time_since_food", 0)
        total_time_mins = state.get("total_time_mins", 0)
        current_node = state.get("current_node")
        visited = state.get("visited", [])
        history = state.get("history", [])

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
            
            # Regla de Alojamiento (20h)
            if time_since_sleep + flight_time_hours >= 20:
                time_since_sleep = 0  # Se asume que durmió al cobrar el hospedaje
            else:
                time_since_sleep += flight_time_hours

            # Regla de Alimentación (8h)
            if time_since_food + flight_time_hours >= 8:
                time_since_food = 0   # Se asume que comió
            else:
                time_since_food += flight_time_hours
                
            # Registrar el paso y cambiar de nodo
            visited.append(current_node)
            
            history.append({
                "type": "flight",
                "from": current_node,
                "to": destination,
                "cost": total_cost,
                "time_mins": flight_time_mins,
                "aircraft": action_details.get("aircraft")
            })
            
            current_node = destination

        elif action_type == "job":
            tarifa = action_details.get("tarifaHora", 0)
            horas = action_details.get("horas", 0)
            max_horas = action_details.get("maxHoras", horas)
            
            if horas > max_horas:
                return {"error": f"No puedes trabajar más de {max_horas} horas en este empleo."}
                
            ingreso = tarifa * horas
            current_budget += ingreso
            
            total_time_mins += (horas * 60)
            time_since_sleep += horas
            time_since_food += horas
            
            history.append({
                "type": "job",
                "location": current_node,
                "name": action_details.get("nombre"),
                "earned": ingreso,
                "hours": horas
            })

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
            
            history.append({
                "type": "activity",
                "location": current_node,
                "name": action_details.get("nombre"),
                "cost": costo,
                "time_mins": duracion
            })
        else:
            return {"error": "Tipo de acción no válido ('flight', 'job', 'activity')."}

        # Devolver el estado empaquetado para el frontend
        new_state = {
            "initial_budget": state.get("initial_budget"),
            "current_node": current_node,
            "current_budget": current_budget,
            "time_since_sleep": time_since_sleep,
            "time_since_food": time_since_food,
            "total_time_mins": total_time_mins,
            "visited": visited,
            "history": history
        }

        return {"status": "success", "new_state": new_state}