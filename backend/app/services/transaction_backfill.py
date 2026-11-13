
from app.extensions import db
from app.models import Transaction
from app.services.transaction_categorizer import (
    classify_bank_transaction,
    classify_budget_group,
)



def backfill_bank_categories(
    user_id: str,
    *,
    include_legacy: bool = False,
    apply: bool = False,
    account_ids: list[str] | None = None,
    commit: bool = True,
):
    """Preview or apply bank category suggestions.

    Manual categories are never overwritten.
    Legacy records require explicit opt-in.
    """
    eligible_sources = ["UNCLASSIFIED"]

    if include_legacy:
        eligible_sources.append("LEGACY")

    query = Transaction.query.filter(
        Transaction.user_id == user_id,
        Transaction.source == "BANK",
        Transaction.bank_account_id.isnot(None),
        Transaction.category.is_(None),
        Transaction.category_source.in_(eligible_sources),
    )

    if account_ids is not None:
        query = query.filter(
            Transaction.bank_account_id.in_(account_ids)
        )

    if apply:
        query = query.with_for_update()

    suggestions = []

    for transaction in query.order_by(Transaction.id).all():
        suggested = classify_bank_transaction(
            transaction.description,
            transaction.amount,
            transaction.transaction_type,
        )

        if suggested is None:
            continue

        suggestions.append({
            "transaction_id": transaction.id,
            "description": transaction.description,
            "category": suggested,
            "budget_group": classify_budget_group(suggested),
            "previous_source": transaction.category_source,
        })

        if apply:
            transaction.category = suggested
            transaction.category_source = "AUTO"

    if apply:
        if commit:
            db.session.commit()
        else:
            db.session.flush()

    return {
        "mode": "apply" if apply else "preview",
        "count": len(suggestions),
        "suggestions": suggestions,
    }
