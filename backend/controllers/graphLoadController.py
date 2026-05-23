from flask import Blueprint, request, jsonify
from services.graphLoadService import GraphLoadService

# Define the blueprint
graph_load_bp = Blueprint('graph_load', __name__)

# Single instance of the service to maintain the state of the loaded graph
load_service = GraphLoadService()

@graph_load_bp.route('/load', methods=['POST'])
def load_graph():
    """
    Endpoint to receive the JSON file content and initialize the network.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Load logic
        load_service.load_from_json(data)
        
        # Get data formatted for JS visualization
        network_data = load_service.get_frontend_network_data()
        
        return jsonify({
            "status": "success",
            "message": "Aviation network loaded successfully",
            "data": network_data
        }), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@graph_load_bp.route('/airport/<string:iata_code>', methods=['GET'])
def get_airport_details(iata_code):
    """
    Endpoint to fetch specific information for a single node (R1 requirement).
    """
    for vertex in load_service.graph.vertexes:
        if vertex.identifier == iata_code:
            return jsonify(vertex.to_dict()), 200
            
    return jsonify({"error": "Airport not found"}), 404