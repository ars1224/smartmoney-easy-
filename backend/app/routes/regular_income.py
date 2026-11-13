
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
)
from app.extensions import db
from app.models import RegularIncomeProfile
from app.services.regular_income import (
    calculate_monthly_income,
)


regular_income_bp = Blueprint(
    "regular_income",
    __name__,
    url_prefix="/api/regular-income",
)

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("999999999999.99")

PAY_FREQUENCIES = {
    "WEEKLY",
    "FORTNIGHTLY",
    "MONTHLY",
    "YEARLY",
}


def parse_decimal(value, *, name, maximum):
    if (
        isinstance(value, bool)
        or not isinstance(value, (str, int, float))
    ):
        raise ValueError(f"Invalid {name}.")

    try:
        number = Decimal(str(value))

        if not number.is_finite():
            raise ValueError(f"Invalid {name}.")

        if number < 0 or number > maximum:
            raise ValueError(
                f"{name} is outside the allowed range."
            )

        rounded = number.quantize(CENT)

        if rounded != number:
            raise ValueError(
                f"{name} cannot exceed two decimal places."
            )

        return rounded

    except InvalidOperation:
        raise ValueError(f"Invalid {name}.")


def validate_profile(data):
    allowed = {
        "incomeType",
        "amount",
        "payFrequency",
        "hoursPerWeek",
    }

    if (
        not isinstance(data, dict)
        or set(data) != allowed
    ):
        raise ValueError(
            "Income type, amount, pay frequency and "
            "weekly hours fields are required."
        )

    income_type = data["incomeType"]

    if income_type not in ("SALARY", "HOURLY"):
        raise ValueError(
            "Income type must be SALARY or HOURLY."
        )

    amount = parse_decimal(
        data["amount"],
        name="Income amount",
        maximum=MAX_AMOUNT,
    )

    if income_type == "SALARY":
        frequency = data["payFrequency"]

        if (
            not isinstance(frequency, str)
            or frequency not in PAY_FREQUENCIES
            or data["hoursPerWeek"] is not None
        ):
            raise ValueError(
                "Select a valid salary pay frequency."
            )

        hours = None

    else:
        if data["payFrequency"] is not None:
            raise ValueError(
                "Hourly income does not use pay frequency."
            )

        frequency = None

        hours = parse_decimal(
            data["hoursPerWeek"],
            name="Weekly hours",
            maximum=Decimal("168.00"),
        )

    # Also ensures the calculated monthly value
    # stays within the financial amount limit.
    calculate_monthly_income(
        income_type=income_type,
        amount=amount,
        pay_frequency=frequency,
        hours_per_week=hours,
    )

    return income_type, amount, frequency, hours


def serialize_profile(profile):
    monthly = calculate_monthly_income(
        income_type=profile.income_type,
        amount=profile.amount,
        pay_frequency=profile.pay_frequency,
        hours_per_week=profile.hours_per_week,
    )

    return {
        "incomeType": profile.income_type,
        "amount": str(profile.amount),
        "payFrequency": profile.pay_frequency,
        "hoursPerWeek": (
            str(profile.hours_per_week)
            if profile.hours_per_week is not None
            else None
        ),
        "monthlyEstimate": str(monthly),
    }


def no_cache(payload, status=200):
    response = jsonify(payload)
    response.headers["Cache-Control"] = "no-store"
    return response, status


@regular_income_bp.get("")
def get_regular_income():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    profile = RegularIncomeProfile.query.filter_by(
        user_id=user_id,
    ).first()

    return no_cache({
        "profile": (
            serialize_profile(profile)
            if profile is not None
            else None
        )
    })


@regular_income_bp.put("")
@csrf_required
def save_regular_income():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    try:
        (
            income_type,
            amount,
            frequency,
            hours,
        ) = validate_profile(
            request.get_json(silent=True)
        )

    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    profile = RegularIncomeProfile.query.filter_by(
        user_id=user_id,
    ).with_for_update().first()

    if profile is None:
        profile = RegularIncomeProfile(
            user_id=user_id,
        )
        db.session.add(profile)

    profile.income_type = income_type
    profile.amount = amount
    profile.pay_frequency = frequency
    profile.hours_per_week = hours

    try:
        db.session.commit()

    except IntegrityError:
        db.session.rollback()

        return jsonify({
            "error": (
                "Income settings changed concurrently. "
                "Please reload and retry."
            )
        }), 409

    return no_cache({
        "message": "Regular income settings saved.",
        "profile": serialize_profile(profile),
    })