import os
import sys
from flask import Flask, render_template
from flask_cors import CORS

# ── Paths ──────────────────────────────────────────────────
# backend/app.py  →  backend_dir  =  .../backend/
# frontend/       →  frontend_dir =  .../frontend/
BACKEND_DIR  = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.normpath(os.path.join(BACKEND_DIR, '..', 'frontend'))

# Ensure imports like 'from controllers.xxx import yyy' resolve correctly
# when running:  cd backend && python app.py
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# ── Blueprint imports (after sys.path is ready) ────────────
from controllers.graphLoadController import graph_load_bp
from controllers.routePerformanceController import route_performance_bp
from controllers.reportController import report_bp
from controllers.interruptionController import interruption_bp
from controllers.dynamicTravelController import dynamic_travel_bp


# ════════════════════════════════════════════════════════════
def create_app():
    app = Flask(
        __name__,
        # HTML templates come from  frontend/views/
        template_folder=os.path.join(FRONTEND_DIR, 'views'),
        # ALL static assets (css/, js/, assets/) are served from  frontend/
        # at the URL root, so  /css/app.css  maps to  frontend/css/app.css
        static_folder=FRONTEND_DIR,
        static_url_path='',
    )

    # Allow browser fetch() from any origin during development
    CORS(app)

    # ── Main page ──────────────────────────────────────────
    @app.route('/')
    def index():
        return render_template('app.html')

    # ── API blueprints ─────────────────────────────────────
    app.register_blueprint(graph_load_bp,        url_prefix='/api/graph')
    app.register_blueprint(route_performance_bp, url_prefix='/api/routes')
    app.register_blueprint(report_bp,            url_prefix='/api/report')
    app.register_blueprint(interruption_bp,      url_prefix='/api/interruptions')
    app.register_blueprint(dynamic_travel_bp,    url_prefix='/api/dynamic')

    return app


# ════════════════════════════════════════════════════════════
if __name__ == '__main__':
    sky_route_app = create_app()
    # Visit: http://localhost:5000
    sky_route_app.run(debug=True, host='0.0.0.0', port=5000)