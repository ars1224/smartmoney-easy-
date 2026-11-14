
from decimal import (
    Decimal,
    InvalidOperation,
    ROUND_HALF_UP,
)


CENT = Decimal("0.01")
MAX_MONTHLY = Decimal("999999999999.99")

PAY_PERIODS_PER_YEAR = {
    "WEEKLY": Decimal("52"),
    "FORTNIGHTLY": Decimal("26"),
    "MONTHLY": Decimal("12"),
    "YEARLY": Decimal("1"),
}


def calculate_monthly_income(
    *,
    income_type,
    amount,
    pay_frequency=None,
    hours_per_week=None,
):
    """
    Calculate average expected monthly take-home income.

    SALARY:
        amount = take-home pay per selected period

    HOURLY:
        amount = estimated take-home hourly rate
        hours_per_week = usual weekly hours

    All calculations use Decimal for financial precision.
    """

    try:
        if isinstance(amount, bool):
            raise ValueError("Invalid income amount.")

        pay = Decimal(str(amount))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid income amount.")

    if not pay.is_finite() or pay < 0:
        raise ValueError(
            "Income amount must be zero or greater."
        )

    if income_type == "SALARY":
        periods = PAY_PERIODS_PER_YEAR.get(
            pay_frequency
        )

        if periods is None or hours_per_week is not None:
            raise ValueError(
                "Valid salary pay frequency is required."
            )

        monthly = pay * periods / Decimal("12")

    elif income_type == "HOURLY":
        if pay_frequency is not None:
            raise ValueError(
                "Hourly income must not have a pay frequency."
            )

        try:
            if isinstance(hours_per_week, bool):
                raise ValueError("Invalid weekly hours.")

            hours = Decimal(str(hours_per_week))
        except (InvalidOperation, TypeError, ValueError):
            raise ValueError("Invalid weekly hours.")

        if (
            not hours.is_finite()
            or hours < 0
            or hours > 168
        ):
            raise ValueError(
                "Weekly hours must be between 0 and 168."
            )

        monthly = (
            pay * hours * Decimal("52") / Decimal("12")
        )

    else:
        raise ValueError(
            "Income type must be SALARY or HOURLY."
        )

    if monthly > MAX_MONTHLY:
        raise ValueError(
            "Calculated monthly income exceeds the limit."
        )

    return monthly.quantize(
        CENT,
        rounding=ROUND_HALF_UP,
    )
