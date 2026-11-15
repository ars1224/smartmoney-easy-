from datetime import timezone
from flask import Blueprint, current_app, jsonify, request
from sqlalchemy.exc import SQLAlchemyError
from app.auth_security import get_authenticated_user_id
from app.extensions import db
from app.services.reports import NZ, money, report_month, summarise
from app.services.report_transactions import report_transactions

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")

@reports_bp.get("")
@reports_bp.get("/category")
def get_report():
    user_id = get_authenticated_user_id()
    if not user_id:
        return jsonify({"error": "Authentication required."}), 401
    source = request.args.get("source", "all")
    if source not in ("all", "cash", "bank"):
        return jsonify({"error": "Choose all, cash or bank."}), 400
    try:
        # Explicitly reject an empty month instead of silently substituting today.
        supplied = request.args.get("month")
        if supplied == "":
            raise ValueError("Select a month in YYYY-MM format.")
        month, start, end = report_month(supplied)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    category = request.args.get("category", "").strip()
    detail = request.path.endswith("/category")
    if detail and (not category or len(category) > 80):
        return jsonify({"error": "Choose a category of 1 to 80 characters."}), 400
    try:
        query = report_transactions(user_id, month, source, start, end)
        expenses = []
        summary = summarise(query.all(), month, source, expenses if detail else None)
        if detail:
            selected = [row for row in expenses if ((row.category or "").strip() or "Uncategorised").casefold() == category.casefold()]
            selected.sort(key=lambda row: (row.transaction_date, row.id), reverse=True)
            from decimal import Decimal
            response = jsonify({
                "month": month, "source": source, "category": category, "currency": "NZD",
                "total": money(sum((-Decimal(row.amount) for row in selected), Decimal("0.00"))),
                "transactions": [{
                    "id": row.id, "description": row.description,
                    "source": row.source.lower(), "amount": money(row.amount), "currency": row.currency,
                    "date": row.transaction_date.isoformat(),
                    "reportDate": (row.transaction_date.date() if row.source == "CASH" else (
                        row.transaction_date.replace(tzinfo=timezone.utc) if row.transaction_date.tzinfo is None else row.transaction_date
                    ).astimezone(NZ).date()).isoformat(),
                } for row in selected],
            })
        else:
            response = jsonify(summary)
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Unable to load report")
        response = jsonify({"error": "Reports are unavailable. Please try again."})
        response.status_code = 503
    response.headers["Cache-Control"] = "no-store"
    return response
