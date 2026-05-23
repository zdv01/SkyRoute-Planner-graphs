from flask import Blueprint, request, jsonify
# Asegúrate de ajustar el path de importación según tu estructura real
from services.reportService import FinalReport 

report_bp = Blueprint('report', __name__)

@report_bp.route('/generate', methods=['POST'])
def generate_final_report():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No payload provided"}), 400

        # Usamos el classmethod que definiste para instanciar el reporte
        report = FinalReport.from_dict(data)

        # Devolvemos el reporte formateado usando tu método to_dict()
        return jsonify({
            "status": "success",
            "message": "Report generated successfully",
            "data": report.to_dict()
        }), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Error generating report: {str(e)}"
        }), 500