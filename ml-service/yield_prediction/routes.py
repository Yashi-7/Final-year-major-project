"""HTTP layer for yield prediction. Called server-to-server by the Node backend."""

from flask import Blueprint, current_app, jsonify, request

from security import check_internal_key

from .service import ModelUnavailableError, ValidationError

bp = Blueprint("yield_prediction", __name__, url_prefix="/yield-prediction")
bp.before_request(check_internal_key)

_UNAVAILABLE = {"success": False, "code": "MODEL_UNAVAILABLE", "message": "Yield prediction model is not available."}


@bp.get("/ready")
def ready():
    predictor = current_app.config["YIELD_PREDICTOR"]
    if predictor.ready:
        return jsonify({"status": "ready", "model": "yield-prediction"}), 200
    return jsonify({"status": "unavailable", "model": "yield-prediction"}), 503


@bp.get("/options")
def options():
    predictor = current_app.config["YIELD_PREDICTOR"]
    try:
        return jsonify({"success": True, "data": predictor.options()}), 200
    except ModelUnavailableError:
        return jsonify(_UNAVAILABLE), 503


@bp.post("/predict")
def predict():
    predictor = current_app.config["YIELD_PREDICTOR"]
    payload = request.get_json(silent=True)
    try:
        result, notice = predictor.predict(payload)
    except ValidationError as exc:
        return jsonify(
            {"success": False, "code": "VALIDATION_ERROR", "message": "Validation failed", "errors": exc.errors}
        ), 400
    except ModelUnavailableError:
        return jsonify(_UNAVAILABLE), 503
    return jsonify({"success": True, "data": {**result, "notice": notice}}), 200
