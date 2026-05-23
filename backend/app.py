#SOURCE / breakpoint
from flask import Flask
from flask_cors import CORS
from controllers.graphLoadController import graph_load_bp

def create_app():
    app = Flask(__name__)
    
    # Enable CORS for frontend-backend communication (Crucial for JS fetch)
    CORS(app)

    # Register Blueprints (Controllers)
    app.register_blueprint(graph_load_bp, url_prefix='/api/graph')

    return app

if __name__ == '__main__':
    sky_route_app = create_app()
    # Running on port 5000 by default
    sky_route_app.run(debug=True, host='0.0.0.0', port=5000)