
from flask import Flask
from flask_cors import CORS

from config import Config
from app.extensions import db, migrate

from app.routes import (
    health_bp,
    bank_accounts_bp,
    auth_bp,
    bank_oauth_bp,
    savings_goals_bp,
)

from app.routes.learn import learn_bp
from app.routes.cash_wallets import cash_wallets_bp
from app.routes.cash_transactions import cash_transactions_bp
from app.routes.budgets import budgets_bp
from app.routes.monthly_income import monthly_income_bp
from app.routes.regular_income import regular_income_bp
from app.routes.onboarding import onboarding_bp
from app.routes.payroll import payroll_bp
from app.routes.budget_allocations import budget_allocations_bp


def create_app():
    app = Flask(__name__)

    app.config.from_object(Config)

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
        allow_headers=[
            "Content-Type",
            "X-CSRF-Token",
        ],
    )

    db.init_app(app)

    from app import models

    migrate.init_app(app, db)

    app.register_blueprint(learn_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(bank_oauth_bp)
    app.register_blueprint(cash_wallets_bp)
    app.register_blueprint(cash_transactions_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(bank_accounts_bp)
    app.register_blueprint(savings_goals_bp)
    app.register_blueprint(budgets_bp)
    app.register_blueprint(monthly_income_bp)
    app.register_blueprint(regular_income_bp)
    app.register_blueprint(onboarding_bp)
    app.register_blueprint(payroll_bp)
    app.register_blueprint(budget_allocations_bp)

    return app
