
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, request
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError

from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
)
from app.extensions import db
from app.models import Budget, Transaction


budgets_bp = Blueprint(
    "budgets",
    __name__,
    url_prefix="/api/budgets",
)

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("999999999999.99")
NZ_TIMEZONE = ZoneInfo("Pacific/Auckland")

CATEGORIES = (
    "Groceries",
    "Transport",
    "Entertainment",
    "Shopping",
    "Bills",
    "Eating out",
    "Other",
)

CATEGORY_LOOKUP = {
    category.casefold(): category
    for category in CATEGORIES
}


def parse_category(value):
    if not isinstance(value, str):
        raise ValueError("A valid category is required.")

    category = CATEGORY_LOOKUP.get(
        value.strip().casefold()
    )

    if category is None:
        raise ValueError("Unsupported budget category.")

    return category


def parse_monthly_limit(value):
    if (
        value is None
        or isinstance(value, bool)
        or not isinstance(value, (str, int, float))
    ):
        raise ValueError("A valid monthly limit is required.")

    try:
        amount = Decimal(str(value))

        if not amount.is_finite():
            raise ValueError("Monthly limit must be finite.")

        if amount <= 0 or amount > MAX_AMOUNT:
            raise ValueError(
                "Monthly limit must be positive and within range."
            )

        rounded = amount.quantize(CENT)

        if amount != rounded:
            raise ValueError(
                "Monthly limit cannot exceed two decimal places."
            )

        return rounded

    except InvalidOperation:
        raise ValueError("Invalid monthly limit.")


def current_month():
    now = datetime.now(NZ_TIMEZONE)
    year, month = now.year, now.month

    start = datetime(
        year, month, 1, tzinfo=NZ_TIMEZONE
    )

    if month == 12:
        next_year, next_month = year + 1, 1
    else:
        next_year, next_month = year, month + 1

    end = datetime(
        next_year, next_month, 1,
        tzinfo=NZ_TIMEZONE,
    )

    return (
        f"{year:04d}-{month:02d}",
        start.astimezone(timezone.utc),
        end.astimezone(timezone.utc),
    )


def get_monthly_spending(user_id, start, end):
    category_key = func.lower(
        func.trim(Transaction.category)
    )

    rows = (
        db.session.query(
            category_key,
            func.sum(-Transaction.amount),
        )
        .filter(
            Transaction.user_id == user_id,
            Transaction.currency == "NZD",
            Transaction.amount < 0,
            Transaction.category.isnot(None),
            Transaction.transaction_date >= start,
            Transaction.transaction_date < end,
            or_(
                and_(
                    Transaction.source == "CASH",
                    func.lower(
                        Transaction.transaction_type
                    ) == "expense",
                ),
                and_(
                    Transaction.source == "BANK",
                    ~func.lower(
                        Transaction.transaction_type
                    ).like("%transfer%"),
                ),
            ),
        )
        .group_by(category_key)
        .all()
    )

    return {
        category: amount
        for category, amount in rows
        if category
    }


def serialize_budget(budget, spending):
    spent = spending.get(
        budget.category.casefold(),
        Decimal("0.00"),
    )

    return {
        "id": budget.id,
        "category": budget.category,
        "monthlyLimit": str(budget.monthly_limit),
        "spent": str(spent),
        "createdAt": budget.created_at.isoformat(),
        "updatedAt": budget.updated_at.isoformat(),
    }


def no_cache(payload, status=200):
    response = jsonify(payload)
    response.headers["Cache-Control"] = "no-store"
    return response, status


@budgets_bp.get("")
def list_budgets():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    month, start, end = current_month()

    spending = get_monthly_spending(
        user_id, start, end
    )

    budgets = (
        Budget.query
        .filter_by(user_id=user_id)
        .order_by(Budget.category.asc())
        .all()
    )

    return no_cache({
        "month": month,
        "budgets": [
            serialize_budget(budget, spending)
            for budget in budgets
        ],
        "count": len(budgets),
    })


@budgets_bp.post("")
@csrf_required
def create_budget():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if (
        not isinstance(data, dict)
        or set(data) != {"category", "monthlyLimit"}
    ):
        return jsonify({
            "error": "Category and monthlyLimit are required."
        }), 400

    try:
        category = parse_category(data["category"])
        monthly_limit = parse_monthly_limit(
            data["monthlyLimit"]
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    budget = Budget(
        user_id=user_id,
        category=category,
        monthly_limit=monthly_limit,
    )

    try:
        db.session.add(budget)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "error": "A budget for this category already exists."
        }), 409

    _, start, end = current_month()
    spending = get_monthly_spending(
        user_id, start, end
    )

    return no_cache({
        "message": "Budget created successfully.",
        "budget": serialize_budget(budget, spending),
    }, 201)


@budgets_bp.patch("/<budget_id>")
@csrf_required
def update_budget(budget_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if (
        not isinstance(data, dict)
        or not data
        or not set(data).issubset(
            {"category", "monthlyLimit"}
        )
    ):
        return jsonify({
            "error": "Unsupported or empty budget update."
        }), 400

    try:
        category = (
            parse_category(data["category"])
            if "category" in data else None
        )

        monthly_limit = (
            parse_monthly_limit(data["monthlyLimit"])
            if "monthlyLimit" in data else None
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    budget = (
        Budget.query
        .filter_by(id=budget_id, user_id=user_id)
        .with_for_update()
        .first()
    )

    if budget is None:
        return jsonify({
            "error": "Budget not found."
        }), 404

    if category is not None:
        budget.category = category

    if monthly_limit is not None:
        budget.monthly_limit = monthly_limit

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "error": "A budget for this category already exists."
        }), 409

    _, start, end = current_month()
    spending = get_monthly_spending(
        user_id, start, end
    )

    return no_cache({
        "message": "Budget updated successfully.",
        "budget": serialize_budget(budget, spending),
    })
