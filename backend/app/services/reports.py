"""Deterministic reporting over user-owned saved transactions; no external calls."""
import calendar
import re
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

NZ = ZoneInfo("Pacific/Auckland")
ZERO = Decimal("0.00")

def report_month(value=None):
    value = value or datetime.now(NZ).strftime("%Y-%m")
    if not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", value):
        raise ValueError("Select a month in YYYY-MM format.")
    year, month = map(int, value.split("-"))
    if not 1900 <= year <= 9998:
        raise ValueError("Select a year between 1900 and 9998.")
    start = datetime(year, month, 1, tzinfo=NZ)
    end = datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=NZ)
    return value, start.astimezone(timezone.utc), end.astimezone(timezone.utc)

def money(value):
    return format(value, ".2f")

def summarise(transactions, month, source, expense_rows=None):
    income = expenses = refunds = ZERO
    excluded = {"foreignCurrency": 0, "transfers": 0, "reviewNeeded": 0}
    categories = {}
    year, number = map(int, month.split("-"))
    daily = {f"{month}-{day:02}": {"income": ZERO, "expenses": ZERO, "refunds": ZERO}
             for day in range(1, calendar.monthrange(year, number)[1] + 1)}
    count = uncategorised = bank_count = 0
    for row in transactions:
        date = row.transaction_date
        local = date.date() if row.source == "CASH" else (
            date.replace(tzinfo=timezone.utc) if date.tzinfo is None else date
        ).astimezone(NZ).date()
        if local.strftime("%Y-%m") != month:
            continue
        if row.currency != "NZD":
            excluded["foreignCurrency"] += 1
            continue
        amount = Decimal(row.amount)
        kind = row.transaction_type.strip().upper()
        if "TRANSFER" in kind:
            excluded["transfers"] += 1
            continue
        description = row.description or ""
        if re.search(r"\btransfer\b", description, re.I) or (
            re.search(r"\brefund\b", description, re.I) and "REFUND" not in kind
        ):
            excluded["reviewNeeded"] += 1
            continue
        if amount == 0:
            continue
        if ("REFUND" in kind and amount < 0) or (row.source == "CASH" and not (
            (kind == "INCOME" and amount > 0) or (kind == "EXPENSE" and amount < 0)
        )):
            excluded["reviewNeeded"] += 1
            continue
        count += 1
        bank_count += row.source == "BANK"
        day = daily[local.isoformat()]
        if amount > 0 and "REFUND" in kind:
            refunds += amount
            day["refunds"] += amount
        elif amount > 0:
            income += amount
            day["income"] += amount
        else:
            if expense_rows is not None:
                expense_rows.append(row)
            value = -amount
            expenses += value
            day["expenses"] += value
            label = (row.category or "").strip() or "Uncategorised"
            key = label.casefold()
            if key == "uncategorised":
                uncategorised += 1
            if key not in categories:
                categories[key] = {"name": label, "amount": ZERO, "count": 0}
            categories[key]["amount"] += value
            categories[key]["count"] += 1
    groups = sorted(categories.values(), key=lambda item: (-item["amount"], item["name"].casefold()))
    return {
        "month": month, "source": source, "currency": "NZD",
        "income": money(income), "expenses": money(expenses), "refunds": money(refunds),
        "netCashFlow": money(income + refunds - expenses), "transactionCount": count,
        "uncategorisedCount": uncategorised, "bankTransactionCount": bank_count,
        "excluded": excluded,
        "coverage": "partial" if excluded["foreignCurrency"] or excluded["reviewNeeded"] else "complete",
        "categories": [{**item, "amount": money(item["amount"]),
                        "percentage": float(item["amount"] / expenses * 100) if expenses else 0} for item in groups],
        "daily": [{"date": date, **{key: money(value) for key, value in sums.items()}}
                  for date, sums in daily.items()],
    }
