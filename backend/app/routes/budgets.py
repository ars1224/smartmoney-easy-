
import re
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
from app.models import Budget, BudgetMonthlyLimit, Transaction

from app.services.transaction_categorizer import (
    classify_budget_group,
)


budgets_bp = Blueprint(
    "budgets",
    __name__,
    url_prefix="/api/budgets",
)

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("999999999999.99")
NZ_TIMEZONE = ZoneInfo("Pacific/Auckland")

CATEGORIES = (
    # NEEDS
    "Rent",
    "Mortgage",
    "Rates",
    "Groceries",
    "Bills",
    "Electricity",
    "Gas",
    "Water",
    "Internet",
    "Phone",
    "Transport",
    "Fuel",
    "Public Transport",
    "Parking",
    "Healthcare",
    "Pharmacy",
    "Dental",
    "Insurance",
    "Health Insurance",
    "Car Insurance",
    "Education",
    "Childcare",
    "Vehicle Maintenance",
    "Home Maintenance",

    # WANTS
    "Eating out",
    "Takeaways",
    "Coffee & Cafes",
    "Entertainment",
    "Shopping",
    "Clothing",
    "Electronics",
    "Subscriptions",
    "Travel",
    "Personal Care",
    "Hobbies",
    "Gifts",
    "Fitness",
    "Pet Care",
    "Donations",

    # CUSTOM
    "Other",
)

CATEGORY_LOOKUP = {
    category.casefold(): category
    for category in CATEGORIES
}


VALID_BUDGET_GROUPS = {"NEEDS", "WANTS"}


def parse_budget_group(value):
    if (
        not isinstance(value, str)
        or value not in VALID_BUDGET_GROUPS
    ):
        raise ValueError(
            "Budget group must be NEEDS or WANTS."
        )

    return value


def parse_category(value):
    if not isinstance(value, str):
        raise ValueError("A valid category is required.")

    cleaned = value.strip()

    if cleaned.casefold().startswith("other - "):
        specific = cleaned[len("other - "):].strip()

        if (
            not specific
            or len(specific) > 72
            or any(
                ord(c) < 32 or ord(c) == 127
                for c in specific
            )
        ):
            raise ValueError(
                "Please specify a valid category (1–72 characters)."
            )

        return f"Other - {specific}"

    category = CATEGORY_LOOKUP.get(cleaned.casefold())

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


def current_month(month_value=None):
    if month_value is None:
        now = datetime.now(NZ_TIMEZONE)
        year, month = now.year, now.month

    else:
        if (
            not isinstance(month_value, str)
            or not re.fullmatch(
                r"[0-9]{4}-(0[1-9]|1[0-2])",
                month_value,
            )
        ):
            raise ValueError(
                "Month must be in YYYY-MM format."
            )

        year, month = map(
            int, month_value.split("-")
        )

        # Avoid datetime overflow at the lower boundary
        # when converting Auckland time to UTC.
        if year < 2 or year > 9998:
            raise ValueError("Month is out of range.")

    start = datetime(
        year, month, 1,
        tzinfo=NZ_TIMEZONE,
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


# Repayments, income and transfers must not be
# automatically counted as new spending.
NON_SPENDING_CATEGORIES = {
    "income",
    "salary",
    "business income",
    "freelance income",
    "interest income",
    "dividends",
    "refund",
    "other income",
    "savings transfer",
    "internal transfer",
    "transfer",
    "investment",
    "bnpl repayment",
    "loan repayment",
    "credit card payment",
}


def get_monthly_group_spending(user_id, start, end):
    totals = {
        "NEEDS": Decimal("0.00"),
        "WANTS": Decimal("0.00"),
    }

    transactions = (
        Transaction.query
        .filter(
            Transaction.user_id == user_id,
            Transaction.currency == "NZD",
            Transaction.amount < 0,
            Transaction.transaction_date >= start,
            Transaction.transaction_date < end,
        )
        .all()
    )

    for transaction in transactions:
        category = (transaction.category or "").strip()
        category_key = category.casefold()
        source = (transaction.source or "").upper()
        kind = (transaction.transaction_type or "").casefold()

        if not category:
            continue

        if (
            category_key in NON_SPENDING_CATEGORIES
            or "transfer" in category_key
        ):
            continue

        if source == "CASH":
            if kind != "expense":
                continue
        elif source == "BANK":
            if "transfer" in kind:
                continue
        else:
            continue

        override = transaction.budget_group_override

        if override == "NONE":
            continue

        group = (
            override
            if override is not None
            else classify_budget_group(category)
        )

        if group in totals:
            totals[group] += -transaction.amount

    return {
        group: str(amount.quantize(CENT))
        for group, amount in totals.items()
    }



def serialize_budget(budget, spending, monthly_limit=None):
    spent = spending.get(
        budget.category.casefold(),
        Decimal("0.00"),
    )

    effective_limit = (
        monthly_limit
        if monthly_limit is not None
        else budget.monthly_limit
    )

    return {
        "id": budget.id,
        "category": budget.category,
        "monthlyLimit": str(effective_limit),
        "spent": str(spent),
        "createdAt": budget.created_at.isoformat(),
        "updatedAt": budget.updated_at.isoformat(),
        "budgetGroup": budget.budget_group,
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

    try:
        month, start, end = current_month(
            request.args.get("month")
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    spending = get_monthly_spending(
        user_id, start, end
    )

    budgets = (
        Budget.query
        .filter_by(user_id=user_id)
        .order_by(Budget.category.asc())
        .all()
    )

    monthly_limits = {}

    if budgets:
        records = (
            BudgetMonthlyLimit.query
            .filter(
                BudgetMonthlyLimit.budget_id.in_(
                    [budget.id for budget in budgets]
                ),
                BudgetMonthlyLimit.month == month,
            )
            .all()
        )

        monthly_limits = {
            record.budget_id: record.monthly_limit
            for record in records
        }

    return no_cache({
        "month": month,
        "groupSpending": get_monthly_group_spending(
            user_id, start, end
        ),
        "budgets": [
            serialize_budget(
                budget,
                spending,
                monthly_limits.get(budget.id),
            )
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

    required_fields = {"category", "monthlyLimit"}
    allowed_fields = required_fields | {"budgetGroup"}

    if (
        not isinstance(data, dict)
        or not required_fields.issubset(data)
        or not set(data).issubset(allowed_fields)
    ):
        return jsonify({
            "error": "Invalid budget details."
        }), 400

    try:
        category = parse_category(data["category"])
        budget_group = (
            parse_budget_group(data["budgetGroup"])
            if "budgetGroup" in data
            else None
        )
        monthly_limit = parse_monthly_limit(
            data["monthlyLimit"]
        )
        month, start, end = current_month(
            request.args.get("month")
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    budget = Budget(
        user_id=user_id,
        category=category,
        budget_group=budget_group,
        monthly_limit=monthly_limit,
    )

    try:
        db.session.add(budget)
        db.session.flush()

        monthly_record = BudgetMonthlyLimit(
            budget_id=budget.id,
            month=month,
            monthly_limit=monthly_limit,
        )

        db.session.add(monthly_record)
        db.session.commit()

    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "error": "A budget for this category already exists."
        }), 409

    spending = get_monthly_spending(
        user_id, start, end
    )

    return no_cache({
        "message": "Budget created successfully.",
        "budget": serialize_budget(
            budget,
            spending,
            monthly_record.monthly_limit,
        ),
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

    allowed_fields = {
        "category",
        "monthlyLimit",
        "budgetGroup",
    }

    if (
        not isinstance(data, dict)
        or not data
        or not set(data).issubset(allowed_fields)
    ):
        return jsonify({
            "error": "Invalid budget details."
        }), 400


    try:
        month, start, end = current_month(
            request.args.get("month")
        )

        category = (
            parse_category(data["category"])
            if "category" in data
            else None
        )

        monthly_limit = (
            parse_monthly_limit(data["monthlyLimit"])
            if "monthlyLimit" in data
            else None
        )

        budget_group = (
            parse_budget_group(data["budgetGroup"])
            if "budgetGroup" in data
            else None
        )

    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    budget = (
        Budget.query
        .filter_by(
            id=budget_id,
            user_id=user_id,
        )
        .with_for_update()
        .first()
    )

    if budget is None:
        return jsonify({
            "error": "Budget not found."
        }), 404

    if category is not None:
        budget.category = category

    if "budgetGroup" in data:
        budget.budget_group = budget_group

    monthly_record = (
        BudgetMonthlyLimit.query
        .filter_by(
            budget_id=budget.id,
            month=month,
        )
        .first()
    )

    if monthly_limit is not None:
        if monthly_record is None:
            monthly_record = BudgetMonthlyLimit(
                budget_id=budget.id,
                month=month,
                monthly_limit=monthly_limit,
            )
            db.session.add(monthly_record)
        else:
            monthly_record.monthly_limit = monthly_limit

    try:
        db.session.commit()

    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "error": "A budget for this category already exists."
        }), 409

    spending = get_monthly_spending(
        user_id, start, end
    )

    effective_limit = (
        monthly_record.monthly_limit
        if monthly_record is not None
        else budget.monthly_limit
    )

    return no_cache({
        "message": "Budget updated successfully.",
        "budget": serialize_budget(
            budget,
            spending,
            effective_limit,
        ),
    })
