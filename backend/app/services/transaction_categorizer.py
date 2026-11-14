
import re
from decimal import Decimal


# Rules for recognised NZ merchants.
CATEGORY_RULES = (
    (
        r"\bPAK\s*N\s*SAVE\b|\bNEW WORLD\b|"
        r"\bWOOLWORTHS\b|\bCOUNTDOWN\b",
        "Groceries",
    ),
    (
        r"\bZ ENERGY\b|\bCALTEX\b|\bMOBIL\b",
        "Transport",
    ),
    (
        r"\bSPARK\b|\bONE NZ\b|\bMERIDIAN\b|"
        r"\bGENESIS ENERGY\b|\bCONTACT ENERGY\b",
        "Bills",
    ),
    (
        r"\bNETFLIX\b|\bSPOTIFY\b|\bDISNEY\b",
        "Entertainment",
    ),
    (
        r"\bMCDONALDS\b|\bKFC\b|"
        r"\bBURGER KING\b|\bSUBWAY\b",
        "Eating out",
    ),
)


def classify_bank_transaction(
    description: str,
    amount: Decimal,
    transaction_type: str,
) -> str | None:
    """Suggest a safe category for a bank transaction."""

    value = Decimal(str(amount))

    if not value.is_finite() or value == 0:
        return None

    normalized = re.sub(
        r"[^A-Z0-9]+",
        " ",
        (description or "").upper(),
    ).strip()

    if not normalized:
        return None

    transaction_kind = (transaction_type or "").upper()

    # Recognised savings and internal transfers.
    # These are labels, not ordinary spending.
    if (
        value < 0
        and re.search(r"\bTRANSFER TO SAVINGS\b", normalized)
    ):
        return "Savings Transfer"

    if re.search(r"\bTRANSFER FROM EVERYDAY\b", normalized):
        return "Internal Transfer"

    # Recognised incoming employment income.
    if value > 0 and re.search(
        r"\bSALARY\b|\bPAYROLL\b|\bWAGES\b",
        normalized,
    ):
        return "Income"

    # Recognised recurring payments.
    if value < 0 and re.search(
        r"\bRENT PAYMENT\b",
        normalized,
    ):
        return "Rent"

    # Afterpay may repay purchases in different budget groups.
    if value < 0 and re.search(
        r"\bAFTERPAY\b",
        normalized,
    ):
        return "BNPL Repayment"

    # Other transfers are labelled neutrally.
    # Do not assume they are expenses or internal transfers.
    if (
        "TRANSFER" in transaction_kind
        or re.search(r"\bTRANSFER\b", normalized)
    ):
        return "Transfer"

    # Only classify recognised merchants as spending.
    if value > 0:
        return None

    for pattern, category in CATEGORY_RULES:
        if re.search(pattern, normalized):
            return category

    # Unknown transactions remain available for manual review.
    return None


CATEGORY_TO_GROUP = {
    "groceries": "NEEDS",
    "transport": "NEEDS",
    "bills": "NEEDS",
    "rent": "NEEDS",
    "eating out": "WANTS",
    "entertainment": "WANTS",
    "shopping": "WANTS",
}


def classify_budget_group(
    category: str | None,
) -> str | None:
    """Determine the spending budget group."""

    if not isinstance(category, str):
        return None

    return CATEGORY_TO_GROUP.get(
        category.strip().casefold()
    )
