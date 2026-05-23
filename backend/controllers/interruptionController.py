from flask import Blueprint, request, jsonify
from services.interruptionService import InterruptionService
from controllers.graphLoadController import load_service

# Definición del Blueprint
interruption_bp = Blueprint('interruptions', __name__)

# Instancia del servicio inyectando el load_service completo
interruption_service = InterruptionService(load_service)

@interruption_bp.route('/block', methods=['POST'])
def block_route():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "message": "No payload provided"}), 400
        
    origin = data.get("origin")
    destination = data.get("destination")
    reason = data.get("reason", "Unknown")
    
    if not origin or not destination:
        return jsonify({"success": False, "message": "Origin and destination are required"}), 400
        
    result = interruption_service.block_route(origin, destination, reason)
    status_code = 200 if result.get("success") else 404
    
    return jsonify(result), status_code

@interruption_bp.route('/unblock', methods=['POST'])
def unblock_route():
    data = request.get_json() or {}
    origin = data.get("origin")
    destination = data.get("destination")

    if not origin or not destination:
        return jsonify({"error": "Origin and destination required"}), 400

    result = interruption_service.unblock_route(origin, destination)
    status_code = 200 if result.get("success") else 404
    return jsonify(result), status_code

@interruption_bp.route('/status', methods=['GET'])
def get_status():
    result = interruption_service.get_network_status()
    return jsonify(result), 200

@interruption_bp.route('/recalculate', methods=['POST'])
def recalculate():
    data = request.get_json() or {}
    origin = data.get("origin")
    destination = data.get("destination")
    # Nota: Tu Service actual usa Dijkstra por defecto internamente

    if not origin or not destination:
        return jsonify({"error": "Origin and destination required"}), 400

    result = interruption_service.recalculate_route(origin, destination)
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code

@interruption_bp.route('/transit', methods=['POST'])
def handle_transit():
    data = request.get_json() or {}
    # Segun tu requerimiento: redirigir al ORIGEN del tramo actual
    current_segment_origin = data.get("origin") 
    final_destination = data.get("finalDestination")

    if not current_segment_origin or not final_destination:
        return jsonify({"error": "origin and finalDestination required"}), 400

    result = interruption_service.handle_in_transit_interruption(current_segment_origin, final_destination)
    return jsonify(result), 200

@interruption_bp.route('/clear', methods=['POST'])
def clear_blocks():
    interruption_service.clear_all_blocks()
    return jsonify({"success": True, "message": "All routes have been reactivated"}), 200