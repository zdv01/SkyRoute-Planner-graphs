from flask import Blueprint, request, jsonify
# Adjust the import path to match your actual project structure
from services.reportService import FinalReport 

report_bp = Blueprint('report', __name__)

@report_bp.route('/generate', methods=['POST'])
def generate_final_report():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No payload provided"}), 400

        # Use the classmethod to instantiate the report
        report = FinalReport.from_dict(data)

        # Return the formatted report using to_dict()
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