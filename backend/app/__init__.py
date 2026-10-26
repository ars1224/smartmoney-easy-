
from flask import Flask
from flask_cors import CORS

from config import Config
from app.extensions import db, migrate
from app.routes import (
    health_bp,
    bank_accounts_bp,
    auth_bp,
    bank_oauth_bp,
)

from app.routes import (
    health_bp,
    bank_accounts_bp,
    auth_bp,
    bank_oauth_bp,
    savings_goals_bp,
)

from app.routes.cash_wallets import cash_wallets_bp

from app.routes.cash_transactions import cash_transactions_bp


def create_app():
    app = Flask(__name__)

    app.register_blueprint(savings_goals_bp)
    app.config.from_object(Config)
    app.register_blueprint(auth_bp)
    app.register_blueprint(bank_oauth_bp)
    app.register_blueprint(cash_wallets_bp)
    app.register_blueprint(cash_transactions_bp)
    CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://localhost:8100",
                "http://localhost:4200",
            ]
        }
    },
    supports_credentials=True,
    allow_headers=["Content-Type", "X-CSRF-Token"]
)

    db.init_app(app)

    from app import models

    migrate.init_app(app, db)

    app.register_blueprint(health_bp)
    app.register_blueprint(bank_accounts_bp)

    return app
