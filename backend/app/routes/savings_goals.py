
import re
from datetime import date
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import SavingsGoal, SavingsGoalContribution
from app.auth_security import (
    get_authenticated_user_id,
    csrf_required,
)


savings_goals_bp = Blueprint(
    "savings_goals",
    __name__,
    url_prefix="/api/savings-goals",
)


MAX_AMOUNT = Decimal("999999999999.99")
CENT = Decimal("0.01")


def serialize_goal(goal):
    return {
        "id": goal.id,
        "name": goal.name,
        "targetAmount": str(goal.target_amount),
        "savedAmount": str(goal.saved_amount),
        "targetDate": goal.target_date.isoformat(),
        "createdAt": goal.created_at.isoformat(),
        "updatedAt": goal.updated_at.isoformat(),
    }


def parse_amount(value, allow_zero=False):
    if value is None or isinstance(value, bool):
        raise ValueError("A valid amount is required.")

    try:
        amount = Decimal(str(value))
        rounded = amount.quantize(CENT)
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid monetary amount.")

    if not amount.is_finite():
        raise ValueError("Amount must be finite.")

    if amount != rounded:
        raise ValueError(
            "Amount cannot have more than two decimal places."
        )

    if amount < 0 or (amount == 0 and not allow_zero):
        raise ValueError(
            "Amount must be non-negative."
            if allow_zero
            else "Amount must be greater than zero."
        )

    if amount > MAX_AMOUNT:
        raise ValueError("Amount exceeds the supported limit.")

    return rounded


def parse_target_date(value):
    if not isinstance(value, str):
        raise ValueError("A valid target date is required.")

    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(
            "Target date must use YYYY-MM-DD format."
        )

    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("Invalid target date.")


@savings_goals_bp.get("")
def get_savings_goals():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    goals = (
        SavingsGoal.query
        .filter_by(user_id=user_id)
        .order_by(SavingsGoal.created_at.desc())
        .all()
    )

    response = jsonify({
        "goals": [serialize_goal(goal) for goal in goals],
        "count": len(goals),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200


@savings_goals_bp.post("")
@csrf_required
def create_savings_goal():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON object is required."
        }), 400

    name = data.get("name")

    if not isinstance(name, str):
        return jsonify({
            "error": "Goal name is required."
        }), 400

    name = name.strip()

    if not name or len(name) > 80:
        return jsonify({
            "error": "Goal name must be 1–80 characters."
        }), 400

    try:
        target_amount = parse_amount(
            data.get("targetAmount")
        )

        saved_amount = parse_amount(
            data.get("savedAmount", 0),
            allow_zero=True,
        )

        target_date = parse_target_date(
            data.get("targetDate")
        )

    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    goal = SavingsGoal(
        user_id=user_id,
        name=name,
        target_amount=target_amount,
        saved_amount=saved_amount,
        target_date=target_date,
    )

    db.session.add(goal)
    db.session.commit()

    response = jsonify({
        "message": "Savings goal created successfully.",
        "goal": serialize_goal(goal),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 201


@savings_goals_bp.patch("/<goal_id>")
@csrf_required
def update_savings_goal(goal_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict) or not data:
        return jsonify({
            "error": "A non-empty JSON object is required."
        }), 400

    allowed = {
        "name",
        "targetAmount",
        "savedAmount",
        "targetDate",
    }

    if not set(data).issubset(allowed):
        return jsonify({
            "error": "Unsupported goal field."
        }), 400

    goal = (
        SavingsGoal.query
        .filter_by(id=goal_id, user_id=user_id)
        .with_for_update()
        .first()
    )

    if goal is None:
        return jsonify({
            "error": "Savings goal not found."
        }), 404

    changes = {}

    try:
        if "name" in data:
            name = data["name"]

            if not isinstance(name, str):
                raise ValueError("Goal name must be text.")

            name = name.strip()

            if not name or len(name) > 80:
                raise ValueError(
                    "Goal name must be 1-80 characters."
                )

            changes["name"] = name

        if "targetAmount" in data:
            changes["target_amount"] = parse_amount(
                data["targetAmount"]
            )

        if "savedAmount" in data:
            changes["saved_amount"] = parse_amount(
                data["savedAmount"],
                allow_zero=True,
            )

        if "targetDate" in data:
            changes["target_date"] = parse_target_date(
                data["targetDate"]
            )

    except ValueError as error:
        db.session.rollback()
        return jsonify({"error": str(error)}), 400

    for field, value in changes.items():
        setattr(goal, field, value)

    db.session.commit()

    response = jsonify({
        "message": "Savings goal updated successfully.",
        "goal": serialize_goal(goal),
    })
    response.headers["Cache-Control"] = "no-store"

    return response, 200


@savings_goals_bp.delete("/<goal_id>")
@csrf_required
def delete_savings_goal(goal_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    goal = (
        SavingsGoal.query
        .filter_by(id=goal_id, user_id=user_id)
        .with_for_update()
        .first()
    )

    if goal is None:
        return jsonify({
            "error": "Savings goal not found."
        }), 404

    db.session.delete(goal)
    db.session.commit()

    response = jsonify({
        "message": "Savings goal deleted successfully."
    })
    response.headers["Cache-Control"] = "no-store"

    return response, 200


@savings_goals_bp.post("/<goal_id>/contributions")
@csrf_required
def add_savings_contribution(goal_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON object is required."
        }), 400

    try:
        amount = parse_amount(data.get("amount"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    goal = (
        SavingsGoal.query
        .filter_by(id=goal_id, user_id=user_id)
        .with_for_update()
        .first()
    )

    if goal is None:
        return jsonify({
            "error": "Savings goal not found."
        }), 404

    new_saved_amount = goal.saved_amount + amount

    if new_saved_amount > MAX_AMOUNT:
        db.session.rollback()

        return jsonify({
            "error": "Savings amount exceeds the supported limit."
        }), 400

    contribution = SavingsGoalContribution(
        goal_id=goal.id,
        amount=amount,
    )

    goal.saved_amount = new_saved_amount

    db.session.add(contribution)
    db.session.commit()

    response = jsonify({
        "message": "Contribution added successfully.",
        "contribution": {
            "id": contribution.id,
            "goalId": contribution.goal_id,
            "amount": str(contribution.amount),
            "createdAt": contribution.created_at.isoformat(),
        },
        "goal": serialize_goal(goal),
    })
    response.headers["Cache-Control"] = "no-store"

    return response, 201

