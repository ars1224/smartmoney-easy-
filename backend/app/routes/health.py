from flask import Blueprint, jsonify
from sqlalchemy import text

from app.extensions import db

health_bp = Blueprint("health", __name__)


@health_bp.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "SmartMoney Easy API"
    }), 200


@health_bp.route("/api/health/database", methods=["GET"])
def database_health_check():
    try:
        db.session.execute(text("SELECT 1"))

        return jsonify({
            "status": "ok",
            "database": "connected"
        }), 200

    except Exception as error:
        return jsonify({
            "status": "error",
            "database": "disconnected",
            "message": str(error)
        }), 500