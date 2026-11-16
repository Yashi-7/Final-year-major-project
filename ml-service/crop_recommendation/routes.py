"""HTTP layer for crop recommendation. Called server-to-server by the Node backend."""

from flask import Blueprint, current_app, jsonify, request

from security import check_internal_key

from .service import ModelUnavailableError, ValidationError

bp = Blueprint("crop_recommendation", __name__, url_prefix="/crop-recommendation")


bp.before_request(check_internal_key)


@bp.get("/ready")
def ready():
    recommender = current_app.config["CROP_RECOMMENDER"]
    if recommender.ready:
        return jsonify({"status": "ready", "model": "crop-recommendation"}), 200
    return jsonify({"status": "unavailable", "model": "crop-recommendation"}), 503


@bp.post("/predict")
def predict():
    recommender = current_app.config["CROP_RECOMMENDER"]
    payload = request.get_json(silent=True)
    try:
        recommendations, notice = recommender.recommend(payload)
    except ValidationError as exc:
        return jsonify(
            {"success": False, "code": "VALIDATION_ERROR", "message": "Validation failed", "errors": exc.errors}
        ), 400
    except ModelUnavailableError:
        return jsonify(
            {"success": False, "code": "MODEL_UNAVAILABLE", "message": "Crop recommendation model is not available."}
        ), 503
    return jsonify({"success": True, "data": {"recommendations": recommendations, "notice": notice}}), 200
