
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_DOWN, ROUND_HALF_UP


CENT = Decimal("0.01")
WHOLE = Decimal("1")

TAX_YEAR_START = date(2026, 4, 1)
TAX_YEAR_END = date(2027, 3, 31)

PAYS_PER_YEAR = {
    "WEEKLY": Decimal("52"),
    "FORTNIGHTLY": Decimal("26"),
    "FOUR_WEEKLY": Decimal("13"),
    "MONTHLY": Decimal("12"),
}

STUDENT_LOAN_THRESHOLDS = {
    "WEEKLY": Decimal("464.00"),
    "FORTNIGHTLY": Decimal("928.00"),
    "FOUR_WEEKLY": Decimal("1856.00"),
    "MONTHLY": Decimal("2010.66"),
}

KIWISAVER_RATES = {
    Decimal("0.035"),
    Decimal("0.04"),
    Decimal("0.06"),
    Decimal("0.08"),
    Decimal("0.10"),
}


def decimal_value(value):
    if isinstance(value, bool):
        raise ValueError("Invalid numeric value.")

    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid numeric value.")

    if not number.is_finite() or number < 0:
        raise ValueError("Amount must be non-negative and finite.")

    return number


def truncate(value, precision=CENT):
    return value.quantize(precision, rounding=ROUND_DOWN)


def annual_income_tax(annual):
    if annual <= 15600:
        return annual * Decimal("0.105")
    if annual <= 53500:
        return annual * Decimal("0.175") - Decimal("1092")
    if annual <= 78100:
        return annual * Decimal("0.30") - Decimal("7779.50")
    if annual <= 180000:
        return annual * Decimal("0.33") - Decimal("10122.50")

    return annual * Decimal("0.39") - Decimal("20922.50")


def estimate_nz_payroll(
    *,
    income_type,
    gross_amount,
    pay_frequency,
    hours_per_week,
    tax_code,
    kiwisaver_rate,
    has_student_loan,
    pay_date,
):
    if not isinstance(pay_date, date) or not (
        TAX_YEAR_START <= pay_date <= TAX_YEAR_END
    ):
        raise ValueError("Unsupported payroll tax year.")

    periods = PAYS_PER_YEAR.get(pay_frequency)

    if periods is None:
        raise ValueError("Unsupported payroll frequency.")

    if not isinstance(has_student_loan, bool):
        raise ValueError("Invalid student loan setting.")

    # First version: ordinary main employment only.
    if tax_code not in ("M", "M SL"):
        raise ValueError("Tax code not supported yet.")

    if (tax_code == "M SL") != has_student_loan:
        raise ValueError(
            "Student loan setting conflicts with tax code."
        )

    effective_code = tax_code

    amount = decimal_value(gross_amount)

    if income_type == "SALARY":
        if hours_per_week is not None:
            raise ValueError("Salary must not specify weekly hours.")

        gross = amount

    elif income_type == "HOURLY":
        hours = decimal_value(hours_per_week)

        if hours > 168:
            raise ValueError("Weekly hours cannot exceed 168.")

        gross = (
            amount * hours * Decimal("52") / periods
        ).quantize(CENT, rounding=ROUND_HALF_UP)

    else:
        raise ValueError("Unsupported income type.")

    # IRD annualises the pay and drops cents.
    annual = truncate(gross * periods, WHOLE)

    income_tax = annual_income_tax(annual)

    acc = (
        annual * Decimal("0.0175")
        if annual < 156641
        else Decimal("2741.22")
    )

    # PAYE includes ACC. Do not subtract ACC again.
    weekly_paye = truncate(
        (income_tax + acc) / Decimal("52")
    )

    paye = truncate(
        weekly_paye * Decimal("52") / periods
    )

    student_loan = Decimal("0.00")

    if has_student_loan:
        taxable_pay = truncate(gross, WHOLE)
        threshold = STUDENT_LOAN_THRESHOLDS[pay_frequency]

        student_loan = truncate(
            max(Decimal("0"), taxable_pay - threshold)
            * Decimal("0.12")
        )

    kiwisaver = Decimal("0.00")

    if kiwisaver_rate is not None:
        rate = decimal_value(kiwisaver_rate)

        if rate not in KIWISAVER_RATES:
            raise ValueError("Unsupported KiwiSaver contribution rate.")

        kiwisaver = truncate(gross * rate)

    net = gross - paye - student_loan - kiwisaver

    average_monthly_net = (
        net * periods / Decimal("12")
    ).quantize(CENT, rounding=ROUND_HALF_UP)

    return {
        "taxYear": "2026-27",
        "effectiveTaxCode": effective_code,
        "grossPerPay": gross,
        "payeIncludingAcc": paye,
        "studentLoan": student_loan,
        "kiwiSaver": kiwisaver,
        "netPerPay": net,
        "estimatedMonthlyNet": average_monthly_net,
    }
