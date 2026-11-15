from decimal import Decimal

from sqlalchemy import func

from app.extensions import db
from app.models import Transaction


def calculate_wallet_balance(wallet):
    transaction_total = (
        db.session.query(func.sum(Transaction.amount))
        .filter(
            Transaction.cash_wallet_id == wallet.id,
            Transaction.user_id == wallet.user_id,
            Transaction.source == "CASH",
        )
        .scalar()
    )

    if transaction_total is None:
        transaction_total = Decimal("0.00")

    return wallet.opening_balance + transaction_total