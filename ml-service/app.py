"""
Python Flask ML service for the AI-Powered Geo-Rural Intelligence System.

Endpoints
  GET  /health                          reachability check (Phase 1)
  GET  /crop-recommendation/ready       model readiness (Phase 3)
  POST /crop-recommendation/predict     crop recommendation (Phase 3)
  GET  /yield-prediction/ready          model readiness (Phase 4)
  GET  /yield-prediction/options        valid states/seasons/crops/years (Phase 4)
  POST /yield-prediction/predict        yield prediction (Phase 4)

The two ML modules share no model code. No hardcoded or fabricated ML results exist here.
"""

import logging
import os

from flask import Flask, jsonify
from flask_cors import CORS

from crop_recommendation.routes import bp as crop_recommendation_bp
from crop_recommendation.service import CropRecommender
from yield_prediction.routes import bp as yield_prediction_bp
from yield_prediction.service import YieldPredictor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(recommender=None, yield_predictor=None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024  # inputs are tiny; reject anything larger

    allowed_origins = os.environ.get("CORS_ORIGIN", "http://localhost:5000").split(",")
    CORS(app, origins=[o.strip() for o in allowed_origins])

    app.config["CROP_RECOMMENDER"] = recommender or CropRecommender()
    app.register_blueprint(crop_recommendation_bp)
    app.config["YIELD_PREDICTOR"] = yield_predictor or YieldPredictor()
    app.register_blueprint(yield_prediction_bp)

    @app.route("/health", methods=["GET"])
    def health_check():
        """Basic reachability check for the ML service."""
        return jsonify({"status": "ok", "service": "ml-service"}), 200

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"success": False, "code": "NOT_FOUND", "message": "Route not found."}), 404

    @app.errorhandler(413)
    def too_large(_):
        return jsonify({"success": False, "code": "PAYLOAD_TOO_LARGE", "message": "Request body too large."}), 413

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("ML_SERVICE_PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
