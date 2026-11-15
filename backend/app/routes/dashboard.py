"""Read-only Dashboard snapshots over saved, signed-in-user data."""
from datetime import datetime, timezone
from flask import Blueprint, current_app, jsonify, request
from sqlalchemy.exc import SQLAlchemyError
from app.auth_security import get_authenticated_user_id
from app.extensions import db
from app.services.report_transactions import report_transactions
from app.services.reports import NZ, money, report_month, summarise

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")

@dashboard_bp.get("")
def overview():
    user_id = get_authenticated_user_id()
    if not user_id:
        return jsonify(error="Authentication required."), 401
    try:
        supplied = request.args.get("month")
        if supplied == "":
            raise ValueError("Select a month in YYYY-MM format.")
        month, start, end = report_month(supplied)
    except ValueError as error:
        return jsonify(error=str(error)), 400
    try:
        rows = report_transactions(user_id, month, "all", start, end).all()
        summary = summarise(rows, month, "all")
        # Stable saved-record order. Cash dates have no implied precise entry time.
        recent = sorted((row for row in rows if row.currency == "NZD"), key=lambda row: (
            row.transaction_date.replace(tzinfo=timezone.utc) if row.transaction_date.tzinfo is None else row.transaction_date,
            row.id,
        ), reverse=True)[:5]
        response = jsonify(
            report=summary, recordCount=len(rows), loadedAt=datetime.now(timezone.utc).isoformat(),
            transactions=[{
                "id": row.id, "name": row.description or "Transaction", "category": (row.category or "").strip() or "Uncategorised",
                "date": row.transaction_date.isoformat(),
                "reportDate": (row.transaction_date.date() if row.source == "CASH" else (
                    row.transaction_date.replace(tzinfo=timezone.utc) if row.transaction_date.tzinfo is None else row.transaction_date
                ).astimezone(NZ).date()).isoformat(),
                "amount": money(row.amount), "currency": row.currency, "source": row.source.lower(),
            } for row in recent],
        )
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Unable to load dashboard")
        response = jsonify(error="Dashboard is unavailable. Please try again.")
        response.status_code = 503
    response.headers["Cache-Control"] = "private, no-store"
    return response
