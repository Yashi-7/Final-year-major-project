"""Shared server-to-server auth for ML blueprints."""

import hmac
import os

from flask import jsonify, request


def check_internal_key():
    """
    before_request hook. If ML_SERVICE_API_KEY is set, callers must send it as X-Internal-Api-Key.
    Returns a 401 response when it is wrong, or None to continue.
    """
    expected = os.environ.get("ML_SERVICE_API_KEY", "")
    if not expected:
        return None
    if hmac.compare_digest(request.headers.get("X-Internal-Api-Key", ""), expected):
        return None
    return jsonify({"success": False, "code": "UNAUTHORIZED", "message": "Invalid service key."}), 401
