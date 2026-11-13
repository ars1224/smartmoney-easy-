from flask import Blueprint, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
)
from app.extensions import db
from app.models import (
    OnboardingProgress,
    PayrollSettings,
    BudgetAllocationPlan,
)

from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from app.routes.budgets import current_month
from app.services.nz_payroll import estimate_nz_payroll



onboarding_bp = Blueprint(
    "onboarding",
    __name__,
    url_prefix="/api/onboarding",
)


@onboarding_bp.get("")
def get_onboarding_progress():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    progress = OnboardingProgress.query.filter_by(
        user_id=user_id
    ).first()

    if progress is None:
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


ONBOARDING_STEPS = (
    "EMPLOYMENT",
    "PAYROLL",
    "BUDGET",
    "REVIEW",
)

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
        or data["currentStep"] not in ONBOARDING_STEPS
    ):
        return jsonify({
            "error": "A valid onboarding step is required."
        }), 400

    next_step = data["currentStep"]

    try:
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

        if progress.status == "COMPLETED":
            return jsonify({
                "error": "Onboarding is already completed."
            }), 409

        current_index = ONBOARDING_STEPS.index(
            progress.current_step
        )
        next_index = ONBOARDING_STEPS.index(next_step)


        if next_index > current_index + 1:
            return jsonify({
                "error": "Complete the previous steps first."
            }), 409

        # Moving forward to Budget requires saved payroll.
        if (
            next_index > current_index
            and next_step == "BUDGET"
        ):
            settings = db.session.get(
                PayrollSettings,
                user_id,
            )

            if settings is None:
                return jsonify({
                    "error": (
                        "Save your payroll settings "
                        "before continuing to Budget."
                    )
                }), 409

            # Confirm the saved payroll configuration
            # can produce an estimate for the current NZ date.
            pay_date = datetime.now(
                ZoneInfo("Pacific/Auckland")
            ).date()

            try:
                estimate_nz_payroll(
                    income_type=settings.income_type,
                    gross_amount=settings.gross_amount,
                    pay_frequency=settings.pay_frequency,
                    hours_per_week=settings.hours_per_week,
                    tax_code=settings.tax_code,
                    kiwisaver_rate=settings.kiwisaver_rate,
                    has_student_loan=settings.has_student_loan,
                    pay_date=pay_date,
                )
            except ValueError:
                return jsonify({
                    "error": (
                        "Your saved payroll settings cannot "
                        "produce a supported estimate. "
                        "Please review them."
                    )
                }), 409


        # Advancing to Review requires a saved allocation
        # for the current New Zealand budget month.
        if (
            next_index > current_index
            and next_step == "REVIEW"
        ):
            month, _, _ = current_month()

            allocation = (
                BudgetAllocationPlan.query
                .filter_by(
                    user_id=user_id,
                    month=month,
                )
                .first()
            )

            if allocation is None:
                return jsonify({
                    "error": (
                        "Save your monthly budget allocation "
                        "before continuing to Review."
                    )
                }), 409

            # The database already enforces percentage
            # ranges and a combined total of 100.
            if (
                allocation.needs_percent
                + allocation.savings_percent
                + allocation.wants_percent
                != 100
            ):
                return jsonify({
                    "error": (
                        "Your saved budget allocation is "
                        "invalid. Please review it."
                    )
                }), 409


        progress.current_step = next_step
        db.session.commit()


    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({
            "error": "Unable to save onboarding progress."
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

    try:
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

        if progress.status == "COMPLETED":
            return jsonify({
                "error": "Onboarding is already completed."
            }), 409

        if progress.current_step != "REVIEW":
            return jsonify({
                "error": (
                    "Complete all setup steps before "
                    "finishing onboarding."
                )
            }), 409

        # Verify saved payroll configuration.
        settings = db.session.get(
            PayrollSettings,
            user_id,
        )

        if settings is None:
            return jsonify({
                "error": "Payroll settings are required."
            }), 409

        pay_date = datetime.now(
            ZoneInfo("Pacific/Auckland")
        ).date()

        try:
            estimate_nz_payroll(
                income_type=settings.income_type,
                gross_amount=settings.gross_amount,
                pay_frequency=settings.pay_frequency,
                hours_per_week=settings.hours_per_week,
                tax_code=settings.tax_code,
                kiwisaver_rate=settings.kiwisaver_rate,
                has_student_loan=settings.has_student_loan,
                pay_date=pay_date,
            )

        except ValueError:
            return jsonify({
                "error": (
                    "Your payroll configuration is invalid "
                    "or unsupported. Please review it."
                )
            }), 409

        # Verify the current NZ month's allocation.
        month, _, _ = current_month()

        allocation = (
            BudgetAllocationPlan.query
            .filter_by(
                user_id=user_id,
                month=month,
            )
            .first()
        )

        if allocation is None:
            return jsonify({
                "error": (
                    "Save your monthly budget allocation "
                    "before finishing onboarding."
                )
            }), 409

        percentages = (
            allocation.needs_percent,
            allocation.savings_percent,
            allocation.wants_percent,
        )

        if (
            any(
                value is None or value < 0 or value > 100
                for value in percentages
            )
            or sum(percentages) != 100
        ):
            return jsonify({
                "error": "Your budget allocation is invalid."
            }), 409

        # Mark setup completed only after all checks pass.
        progress.status = "COMPLETED"
        progress.completed_at = datetime.now(timezone.utc)

        db.session.commit()

    except SQLAlchemyError:
        db.session.rollback()

        return jsonify({
            "error": "Unable to complete onboarding."
        }), 500

    response = jsonify({
        "message": "Onboarding completed successfully.",
        "status": "COMPLETED",
        "currentStep": progress.current_step,
        "onboardingRequired": False,
        "completedAt": progress.completed_at.isoformat(),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200
