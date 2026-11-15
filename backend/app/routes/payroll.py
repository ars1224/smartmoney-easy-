import re
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
)
from app.extensions import db
from app.models import PayrollSettings
from app.services.nz_payroll import (
    KIWISAVER_RATES,
    PAYS_PER_YEAR,
)

from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.nz_payroll import estimate_nz_payroll

payroll_bp = Blueprint(
    "payroll",
    __name__,
    url_prefix="/api/payroll",
)


def serialize_payroll(settings):
    return {
        "incomeType": settings.income_type,
        "grossAmount": str(settings.gross_amount),
        "payFrequency": settings.pay_frequency,
        "hoursPerWeek": (
            str(settings.hours_per_week)
            if settings.hours_per_week is not None
            else None
        ),
        "taxCode": settings.tax_code,
        "kiwiSaverRate": (
            str(settings.kiwisaver_rate)
            if settings.kiwisaver_rate is not None
            else None
        ),
        "hasStudentLoan": settings.has_student_loan,
    }


CENT = Decimal("0.01")
RATE_PRECISION = Decimal("0.0001")
MAX_AMOUNT = Decimal("999999999999.99")

PAY_FREQUENCIES = set(PAYS_PER_YEAR)


def parse_number(value, name, maximum, precision):
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

        if number != number.quantize(precision):
            raise ValueError(
                f"{name} has too many decimal places."
            )

        return number

    except InvalidOperation:
        raise ValueError(f"Invalid {name}.")


def validate_payroll(data):
    required = {
        "incomeType",
        "grossAmount",
        "payFrequency",
        "hoursPerWeek",
        "taxCode",
        "kiwiSaverRate",
        "hasStudentLoan",
    }

    if not isinstance(data, dict) or set(data) != required:
        raise ValueError(
            "All payroll settings fields are required."
        )

    income_type = data["incomeType"]
    frequency = data["payFrequency"]

    if income_type not in ("SALARY", "HOURLY"):
        raise ValueError("Invalid income type.")

    if (
        not isinstance(frequency, str)
        or frequency not in PAY_FREQUENCIES
    ):
        raise ValueError("Invalid pay frequency.")

    amount = parse_number(
        data["grossAmount"],
        "Gross amount",
        MAX_AMOUNT,
        CENT,
    )

    if income_type == "SALARY":
        if data["hoursPerWeek"] is not None:
            raise ValueError(
                "Salary income must not include weekly hours."
            )
        hours = None
    else:
        hours = parse_number(
            data["hoursPerWeek"],
            "Weekly hours",
            Decimal("168"),
            CENT,
        )

    tax_code = data["taxCode"]

    if not isinstance(tax_code, str):
        raise ValueError("Invalid tax code.")

    tax_code = tax_code.strip().upper()

    if tax_code not in ("M", "M SL"):
        raise ValueError(
            "Only M and M SL tax codes are supported.")

    rate = data["kiwiSaverRate"]

    if rate is not None:
        rate = parse_number(
            rate,
            "KiwiSaver rate",
            Decimal("0.10"),
            RATE_PRECISION,
        )

    if rate is not None and rate not in KIWISAVER_RATES:
        raise ValueError(
            "Unsupported KiwiSaver contribution rate.")

    student_loan = data["hasStudentLoan"]

    if not isinstance(student_loan, bool):
        raise ValueError(
            "Student loan setting must be true or false."
        )

    if (tax_code == "M SL") != student_loan:
        raise ValueError(
            "Student loan setting conflicts with tax code.")

    return {
        "income_type": income_type,
        "gross_amount": amount,
        "pay_frequency": frequency,
        "hours_per_week": hours,
        "tax_code": tax_code,
        "kiwisaver_rate": rate,
        "has_student_loan": student_loan,
    }


@payroll_bp.get("/settings")
def get_payroll_settings():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    settings = PayrollSettings.query.filter_by(
        user_id=user_id
    ).first()

    response = jsonify({
        "settings": (
            serialize_payroll(settings)
            if settings is not None
            else None
        )
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200


@payroll_bp.put("/settings")
@csrf_required
def save_payroll_settings():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    try:
        values = validate_payroll(
            request.get_json(silent=True)
        )
    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    try:
        settings = (
            PayrollSettings.query
            .filter_by(user_id=user_id)
            .with_for_update()
            .first()
        )

        if settings is None:
            settings = PayrollSettings(user_id=user_id)
            db.session.add(settings)

        for field, value in values.items():
            setattr(settings, field, value)

        db.session.commit()

        payload = {
            "message": "Payroll settings saved.",
            "settings": serialize_payroll(settings),
        }

    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "error": (
                "Payroll settings changed concurrently. "
                "Please retry."
            )
        }), 409

    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({
            "error": "Unable to save payroll settings."
        }), 500

    response = jsonify(payload)
    response.headers["Cache-Control"] = "no-store"

    return response, 200


@payroll_bp.get("/estimate")
def get_payroll_estimate():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    settings = db.session.get(PayrollSettings, user_id)

    if settings is None:
        return jsonify({
            "error": "Set up your payroll settings first."
        }), 404

    # Use the New Zealand date for the tax-year selection.
    pay_date = datetime.now(
        ZoneInfo("Pacific/Auckland")
    ).date()

    try:
        estimate = estimate_nz_payroll(
            income_type=settings.income_type,
            gross_amount=settings.gross_amount,
            pay_frequency=settings.pay_frequency,
            hours_per_week=settings.hours_per_week,
            tax_code=settings.tax_code,
            kiwisaver_rate=settings.kiwisaver_rate,
            has_student_loan=settings.has_student_loan,
            pay_date=pay_date,
        )
    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 422

    response = jsonify({
        "payDate": pay_date.isoformat(),
        "estimate": {
            key: str(value)
            for key, value in estimate.items()
        },
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200
