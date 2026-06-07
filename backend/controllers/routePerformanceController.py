from flask import Blueprint, request, jsonify
from services.routePerformanceService import RoutePerformanceService
from controllers.graphLoadController import load_service

# Blueprint definition
route_performance_bp = Blueprint('route_performance', __name__)

# Service instance injecting the global loaded graph state
performance_service = RoutePerformanceService(load_service)

@route_performance_bp.route('/optimize', methods=['POST'])
def optimize_route():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No payload provided"}), 400
            
        origin = data.get("origin")
        destination = data.get("destination")
        criteria = data.get("criteria", ["distance"])
        exclude_secondary = data.get("excludeSecondary", False)
        preferred_transports = data.get("preferredTransports", [])

        if not origin or not destination:
            return jsonify({"error": "Origin and destination are strictly required"}), 400

        optimized_routes = performance_service.calculate_optimized_routes(
            origin, destination, criteria, exclude_secondary, preferred_transports
        )

        return jsonify({
            "status": "success",
            "data": optimized_routes
        }), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@route_performance_bp.route('/itinerary', methods=['POST'])
def generate_itinerary():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No payload provided"}), 400

        origin = data.get("origin")
        budget = float(data.get("budget", 0))
        available_time = float(data.get("availableTime", 0))
        preferred_transports = data.get("preferredTransports", [])

        if not origin:
            return jsonify({"error": "Origin node is required"}), 400

        itineraries = performance_service.generate_automatic_itineraries(
            origin, budget, available_time, preferred_transports
        )

        return jsonify({
            "status": "success",
            "data": itineraries
        }), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500