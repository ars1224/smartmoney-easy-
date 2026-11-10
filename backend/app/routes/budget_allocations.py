
from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
)
from app.extensions import db
from app.models import BudgetAllocationPlan
from app.routes.budgets import current_month


budget_allocations_bp = Blueprint(
    "budget_allocations",
    __name__,
    url_prefix="/api/budget-allocations",
)


def no_cache(payload, status=200):
    response = jsonify(payload)
    response.headers["Cache-Control"] = "no-store"
    return response, status


def serialize_allocation(plan):
    return {
        "needsPercent": plan.needs_percent,
        "savingsPercent": plan.savings_percent,
        "wantsPercent": plan.wants_percent,
    }


def parse_percentages(data):
    required = {
        "needsPercent",
        "savingsPercent",
        "wantsPercent",
    }

    if not isinstance(data, dict) or set(data) != required:
        raise ValueError(
            "Needs, Savings and Wants percentages are required."
        )

    values = {}

    for field in required:
        value = data[field]

        # Reject booleans, decimals, strings and out-of-range values.
        if (
            type(value) is not int
            or value < 0
            or value > 100
        ):
            raise ValueError(
                "Each allocation must be a whole percentage "
                "between 0 and 100."
            )

        values[field] = value

    if sum(values.values()) != 100:
        raise ValueError(
            "Needs, Savings and Wants must total 100%."
        )

    return values


@budget_allocations_bp.get("")
def get_budget_allocation():
    user_id = get_authenticated_user_id()

    if not user_id:
        return no_cache({
            "error": "Authentication required."
        }, 401)

    try:
        month, _, _ = current_month(
            request.args.get("month")
        )
    except ValueError as error:
        return no_cache({
            "error": str(error)
        }, 400)

    plan = BudgetAllocationPlan.query.filter_by(
        user_id=user_id,
        month=month,
    ).first()

    return no_cache({
        "month": month,
        "allocation": (
            serialize_allocation(plan)
            if plan is not None
            else None
        ),
    })


@budget_allocations_bp.put("")
@csrf_required
def save_budget_allocation():
    user_id = get_authenticated_user_id()

    if not user_id:
        return no_cache({
            "error": "Authentication required."
        }, 401)

    try:
        month, _, _ = current_month(
            request.args.get("month")
        )

        values = parse_percentages(
            request.get_json(silent=True)
        )

    except ValueError as error:
        return no_cache({
            "error": str(error)
        }, 400)

    try:
        plan = (
            BudgetAllocationPlan.query
            .filter_by(
                user_id=user_id,
                month=month,
            )
            .with_for_update()
            .first()
        )

        if plan is None:
            plan = BudgetAllocationPlan(
                user_id=user_id,
                month=month,
            )
            db.session.add(plan)

        plan.needs_percent = values["needsPercent"]
        plan.savings_percent = values["savingsPercent"]
        plan.wants_percent = values["wantsPercent"]

        db.session.commit()

    except IntegrityError:
        db.session.rollback()

        return no_cache({
            "error": (
                "The allocation was updated concurrently. "
                "Please reload and try again."
            )
        }, 409)

    except SQLAlchemyError:
        db.session.rollback()

        return no_cache({
            "error": "Unable to save budget allocation."
        }, 500)

    return no_cache({
        "message": "Budget allocation saved successfully.",
        "month": month,
        "allocation": serialize_allocation(plan),
    })
