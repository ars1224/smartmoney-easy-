from flask import Flask
from flask_cors import CORS

from config import Config
from app.extensions import db
from app.routes import health_bp


def create_app():
    app = Flask(__name__)

    app.config.from_object(Config)

    CORS(app)

    db.init_app(app)

    app.register_blueprint(health_bp)

    return app