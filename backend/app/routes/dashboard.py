
"""Read-only Dashboard snapshots over saved, signed-in-user data."""

from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from app.auth_security import get_authenticated_user_id
from app.extensions import db
from app.services.report_transactions import report_transactions
from app.services.reports import NZ, money, report_month, summarise


dashboard_bp = Blueprint(
    "dashboard",
    __name__,
    url_prefix="/api/dashboard",
)


def transaction_title(row):
    """Return the same transaction title used by the Activity page."""

    if row.source == "CASH":
        return (
            (row.note or "").strip()
            or (row.category or "").strip()
            or "Transaction"
        )

    return (row.description or "").strip() or "Transaction"


def transaction_report_date(row):
    """Return the reporting date in the appropriate timezone."""

    if row.source == "CASH":
        return row.transaction_date.date().isoformat()

    transaction_date = row.transaction_date

    if transaction_date.tzinfo is None:
        transaction_date = transaction_date.replace(
            tzinfo=timezone.utc
        )

    return transaction_date.astimezone(NZ).date().isoformat()


def serialize_dashboard_transaction(row):
    """Prepare a transaction for the Dashboard Recent Activity section."""

    return {
        "id": row.id,
        "name": transaction_title(row),
        "category": (
            (row.category or "").strip()
            or "Uncategorised"
        ),
        "date": row.transaction_date.isoformat(),
        "reportDate": transaction_report_date(row),
        "amount": money(row.amount),
        "currency": row.currency,
        "source": row.source.lower(),
    }


def transaction_sort_key(row):
    """Sort saved transactions consistently by date and ID."""

    transaction_date = row.transaction_date

    if transaction_date.tzinfo is None:
        transaction_date = transaction_date.replace(
            tzinfo=timezone.utc
        )

    return transaction_date, row.id


@dashboard_bp.get("")
def overview():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify(
            error="Authentication required."
        ), 401

    try:
        supplied = request.args.get("month")

        if supplied == "":
            raise ValueError(
                "Select a month in YYYY-MM format."
            )

        month, start, end = report_month(supplied)

    except ValueError as error:
        return jsonify(
            error=str(error)
        ), 400

    try:
        rows = report_transactions(
            user_id,
            month,
            "all",
            start,
            end,
        ).all()

        summary = summarise(
            rows,
            month,
            "all",
        )

        # Cash dates have no implied precise entry time.
        # Preserve stable saved-record ordering.
        recent = sorted(
            (
                row
                for row in rows
                if row.currency == "NZD"
            ),
            key=transaction_sort_key,
            reverse=True,
        )[:5]

        transactions = [
            serialize_dashboard_transaction(row)
            for row in recent
        ]

        response = jsonify(
            report=summary,
            recordCount=len(rows),
            loadedAt=datetime.now(
                timezone.utc
            ).isoformat(),
            transactions=transactions,
        )

    except SQLAlchemyError:
        db.session.rollback()

        current_app.logger.exception(
            "Unable to load dashboard"
        )

        response = jsonify(
            error="Dashboard is unavailable. Please try again."
        )

        response.status_code = 503

    response.headers["Cache-Control"] = "private, no-store"

    return response
