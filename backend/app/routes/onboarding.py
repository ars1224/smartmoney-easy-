from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
)
from app.extensions import db
from app.models import (
    User,
    OnboardingProgress,
    MonthlyIncomePlan,
    BudgetAllocationPlan,
)
from app.routes.budgets import current_month




onboarding_bp = Blueprint(
    "onboarding",
    __name__,
    url_prefix="/api/onboarding",
)


@onboarding_bp.get("")
def get_onboarding_status():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    user = db.session.get(User, user_id)

    if user is None:
        return jsonify({
            "error": "Authentication required."
        }), 401

    progress = db.session.get(
        OnboardingProgress,
        user_id,
    )

    if progress is None:
        # Users created before mandatory onboarding
        # retain access to the application.
        payload = {
            "status": "LEGACY",
            "currentStep": None,
            "onboardingRequired": False,
            "completedAt": None,
        }

    else:
        payload = {
            "status": progress.status,
            "currentStep": progress.current_step,
            "onboardingRequired": (
                progress.status != "COMPLETED"
            ),
            "completedAt": (
                progress.completed_at.isoformat()
                if progress.completed_at
                else None
            ),
        }

    response = jsonify(payload)
    response.headers["Cache-Control"] = "no-store"

    return response, 200

ALLOWED_ONBOARDING_TRANSITIONS = {
    "EMPLOYMENT": {"PAYROLL", "BUDGET"},
    "PAYROLL": {"BUDGET"},
    "BUDGET": {"REVIEW"},
    "REVIEW": set(),
}


@onboarding_bp.put("/progress")
@csrf_required
def save_onboarding_progress():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if (
        not isinstance(data, dict)
        or set(data) != {"currentStep"}
        or not isinstance(data["currentStep"], str)
    ):
        return jsonify({
            "error": "A valid onboarding step is required."
        }), 400

    next_step = data["currentStep"]

    if next_step not in ALLOWED_ONBOARDING_TRANSITIONS:
        return jsonify({
            "error": "Unsupported onboarding step."
        }), 400

    progress = (
        OnboardingProgress.query
        .filter_by(user_id=user_id)
        .with_for_update()
        .first()
    )

    if progress is None:
        return jsonify({
            "error": "No active onboarding setup found."
        }), 409

    if progress.status != "IN_PROGRESS":
        return jsonify({
            "error": "Onboarding is already completed."
        }), 409

    current_step = progress.current_step

    # Retrying the same step is safe.
    if next_step == current_step:
        response = jsonify({
            "status": progress.status,
            "currentStep": current_step,
            "onboardingRequired": True,
        })
        response.headers["Cache-Control"] = "no-store"
        return response, 200

    allowed = ALLOWED_ONBOARDING_TRANSITIONS.get(
        current_step,
        set(),
    )

    if next_step not in allowed:
        return jsonify({
            "error": "Invalid onboarding step transition."
        }), 409

    # Monthly allocation is required before Review.
    if next_step == "REVIEW":
        month, _, _ = current_month()

        income_plan = MonthlyIncomePlan.query.filter_by(
            user_id=user_id,
            month=month,
        ).first()

        allocation_plan = BudgetAllocationPlan.query.filter_by(
            user_id=user_id,
            month=month,
        ).first()

        if income_plan is None or allocation_plan is None:
            return jsonify({
                "error": (
                    "Save your monthly money and allocation "
                    "before continuing to Review."
                )
            }), 409

        if (
            income_plan.expected_income is None
            or income_plan.expected_income < 0
        ):
            return jsonify({
                "error": "Invalid saved monthly money."
            }), 409

        percentages = (
            allocation_plan.needs_percent,
            allocation_plan.wants_percent,
            allocation_plan.savings_percent,
        )

        if (
            any(
                not isinstance(value, int)
                or value < 0
                or value > 100
                for value in percentages
            )
            or sum(percentages) != 100
        ):
            return jsonify({
                "error": "Your saved allocation is invalid."
            }), 409

    progress.current_step = next_step

    try:
        db.session.commit()

    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({
            "error": (
                "Unable to save onboarding progress. "
                "Please try again."
            )
        }), 500

    response = jsonify({
        "status": progress.status,
        "currentStep": progress.current_step,
        "onboardingRequired": True,
    })
    response.headers["Cache-Control"] = "no-store"

    return response, 200

@onboarding_bp.post("/complete")
@csrf_required
def complete_onboarding():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    progress = (
        OnboardingProgress.query
        .filter_by(user_id=user_id)
        .with_for_update()
        .first()
    )

    if progress is None:
        return jsonify({
            "error": "Onboarding is not required for this account."
        }), 409

    # Repeated completion requests must not change anything.
    if progress.status == "COMPLETED":
        response = jsonify({
            "message": "Onboarding already completed.",
            "status": "COMPLETED",
            "currentStep": "REVIEW",
            "onboardingRequired": False,
            "completedAt": (
                progress.completed_at.isoformat()
                if progress.completed_at
                else None
            ),
        })
        response.headers["Cache-Control"] = "no-store"
        return response, 200

    if progress.current_step != "REVIEW":
        return jsonify({
            "error": (
                "Review your monthly plan "
                "before completing onboarding."
            )
        }), 409

    # Use the current month in New Zealand.
    month, _, _ = current_month()

    income_plan = MonthlyIncomePlan.query.filter_by(
        user_id=user_id,
        month=month,
    ).first()

    allocation_plan = BudgetAllocationPlan.query.filter_by(
        user_id=user_id,
        month=month,
    ).first()

    # Available money must actually have been saved.
    # NZD 0.00 is valid.
    if (
        income_plan is None
        or income_plan.expected_income is None
        or income_plan.expected_income < 0
    ):
        return jsonify({
            "error": (
                "Save your available monthly money "
                "before completing onboarding."
            )
        }), 400

    # Defaults displayed by the frontend do not count.
    # An actual saved allocation record is required.
    if allocation_plan is None:
        return jsonify({
            "error": (
                "Save your monthly budget allocation "
                "before completing onboarding."
            )
        }), 400

    percentages = (
        allocation_plan.needs_percent,
        allocation_plan.wants_percent,
        allocation_plan.savings_percent,
    )

    if (
        any(
            not isinstance(value, int)
            or value < 0
            or value > 100
            for value in percentages
        )
        or sum(percentages) != 100
    ):
        return jsonify({
            "error": (
                "Needs, Wants and Savings percentages "
                "must total 100%."
            )
        }), 400

    progress.status = "COMPLETED"
    progress.current_step = "REVIEW"
    progress.completed_at = datetime.now(timezone.utc)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({
            "error": (
                "Unable to complete onboarding. "
                "Please try again."
            )
        }), 500

    response = jsonify({
        "message": "Onboarding completed successfully.",
        "status": "COMPLETED",
        "currentStep": "REVIEW",
        "onboardingRequired": False,
        "completedAt": progress.completed_at.isoformat(),
    })
    response.headers["Cache-Control"] = "no-store"

    return response, 200