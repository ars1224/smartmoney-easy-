
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
)
from app.extensions import db

from app.services.nz_payroll import estimate_nz_payroll


from app.models import (
    Budget,
    BudgetMonthlyLimit,
    MonthlyIncomePlan,
    RegularIncomeProfile,
    PayrollSettings,
)

from app.services.regular_income import (
    calculate_monthly_income,
)


from app.routes.budgets import current_month

from datetime import datetime
from zoneinfo import ZoneInfo


monthly_income_bp = Blueprint(
    "monthly_income",
    __name__,
    url_prefix="/api/monthly-income",
)

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("999999999999.99")


def parse_expected_income(value):
    if (
        isinstance(value, bool)
        or not isinstance(value, (str, int, float))
    ):
        raise ValueError(
            "A valid expected income is required."
        )

    try:
        amount = Decimal(str(value))

        if not amount.is_finite():
            raise ValueError(
                "Expected income must be finite."
            )

        if amount < 0 or amount > MAX_AMOUNT:
            raise ValueError(
                "Expected income must be between "
                "0 and 999999999999.99."
            )

        rounded = amount.quantize(CENT)

        if amount != rounded:
            raise ValueError(
                "Expected income cannot exceed "
                "two decimal places."
            )

        return rounded

    except InvalidOperation:
        raise ValueError(
            "Invalid expected income."
        )


def no_cache(payload, status=200):
    response = jsonify(payload)
    response.headers["Cache-Control"] = "no-store"
    return response, status


@monthly_income_bp.get("")
def get_monthly_income():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    try:
        month, _, _ = current_month(
            request.args.get("month")
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    plan = MonthlyIncomePlan.query.filter_by(
        user_id=user_id,
        month=month,
    ).first()

    budgets = Budget.query.filter_by(
        user_id=user_id,
    ).all()

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

    allocated = sum(
        (
            monthly_limits.get(
                budget.id,
                budget.monthly_limit,
            )
            for budget in budgets
        ),
        Decimal("0.00"),
    )

    # A saved monthly amount overrides the regular pay baseline.
    if plan is not None:
        expected = plan.expected_income
        income_source = "MONTHLY_OVERRIDE"

    else:
        profile = RegularIncomeProfile.query.filter_by(
            user_id=user_id,
        ).first()

        if profile is not None:
            expected = calculate_monthly_income(
                income_type=profile.income_type,
                amount=profile.amount,
                pay_frequency=profile.pay_frequency,
                hours_per_week=profile.hours_per_week,
            )
            income_source = "REGULAR"


        else:
            # New onboarding users may have payroll settings
            # without a legacy regular income profile.
            payroll = db.session.get(
                PayrollSettings,
                user_id,
            )

            if payroll is not None:
                pay_date = datetime.now(
                    ZoneInfo("Pacific/Auckland")
                ).date()

                try:
                    estimate = estimate_nz_payroll(
                        income_type=payroll.income_type,
                        gross_amount=payroll.gross_amount,
                        pay_frequency=payroll.pay_frequency,
                        hours_per_week=payroll.hours_per_week,
                        tax_code=payroll.tax_code,
                        kiwisaver_rate=payroll.kiwisaver_rate,
                        has_student_loan=payroll.has_student_loan,
                        pay_date=pay_date,
                    )

                    expected = Decimal(
                        str(estimate["estimatedMonthlyNet"])
                    )

                except (ValueError, KeyError, TypeError):
                    return no_cache({
                        "error": (
                            "Unable to calculate your payroll "
                            "take-home estimate. Please review "
                            "your payroll settings."
                        )
                    }, 422)

                income_source = "PAYROLL"

            else:
                expected = None
                income_source = "NOT_SET"


    unallocated = (
        expected - allocated
        if expected is not None
        else None
    )

    return no_cache({
        "month": month,
        "incomeSource": income_source,
        "expectedIncome": (
            str(expected)
            if expected is not None
            else None
        ),
        "allocatedBudget": str(allocated),
        "unallocatedBudget": (
            str(unallocated)
            if unallocated is not None
            else None
        ),
    })



@monthly_income_bp.put("")
@csrf_required
def save_monthly_income():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if (
        not isinstance(data, dict)
        or set(data) != {"expectedIncome"}
    ):
        return jsonify({
            "error": "Expected income is required."
        }), 400

    try:
        month, _, _ = current_month(
            request.args.get("month")
        )

        expected_income = parse_expected_income(
            data["expectedIncome"]
        )

    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    plan = MonthlyIncomePlan.query.filter_by(
        user_id=user_id,
        month=month,
    ).first()

    if plan is None:
        plan = MonthlyIncomePlan(
            user_id=user_id,
            month=month,
            expected_income=expected_income,
        )
        db.session.add(plan)
    else:
        plan.expected_income = expected_income

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "error": (
                "Income plan was modified concurrently. "
                "Please retry."
            )
        }), 409

    return no_cache({
        "message": "Expected income saved.",
        "month": month,
        "expectedIncome": str(plan.expected_income),
    })
