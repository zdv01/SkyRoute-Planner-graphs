from flask import Blueprint, request, jsonify
from services.dynamicTravelService import DynamicTravelService
from controllers.graphLoadController import load_service

dynamic_travel_bp = Blueprint('dynamic_travel', __name__)
travel_service = DynamicTravelService(load_service)

@dynamic_travel_bp.route('/next-options', methods=['POST'])
def get_options():
    """
    Recibe el estado actual del viajero y devuelve qué puede hacer.
    Payload esperado: {
        "current_node": "BOG",
        "initial_budget": 1000,
        "current_budget": 300,
        "time_since_sleep": 5,
        "time_since_food": 2,
        "visited": ["LIM"]
    }
    """
    try:
        data = request.get_json()
        if not data.get("current_node"):
            return jsonify({"error": "current_node is required"}), 400
            
        options = travel_service.get_next_step_options(data)
        suggestion = travel_service.suggest_best_next_move(options)
        
        return jsonify({
            "status": "success",
            "options": options,
            "suggestion": suggestion
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@dynamic_travel_bp.route('/process-action', methods=['POST'])
def process_action():
    """
    Controlador limpio: Solo recibe la petición y delega la regla 
    de transición de estado al servicio.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No payload provided"}), 400
            
        # Validate minimum required fields
        if not data.get("action_type") or not data.get("current_state"):
            return jsonify({"error": "Faltan parámetros requeridos (action_type, current_state)"}), 400

        # Delegate to service
        result = travel_service.process_user_action(data)
        
        # Evaluate service result
        if "error" in result:
            return jsonify({"status": "error", "message": result["error"]}), 400
            
        return jsonify(result), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500