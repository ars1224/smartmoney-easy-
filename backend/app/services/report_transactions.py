"""Shared owner/source/month query used by Dashboard and Reports."""
from datetime import datetime, timezone
from sqlalchemy import and_, or_
from app.models import Transaction
from app.services.reports import NZ


def report_transactions(user_id, month, source, start, end):
    query = Transaction.query.filter(
        Transaction.user_id == user_id,
        or_(Transaction.source == "CASH", and_(Transaction.source == "BANK", Transaction.bank_account_id.isnot(None))),
    )
    if source != "all":
        query = query.filter(Transaction.source == source.upper())
    cash_start = datetime.strptime(month + "-01", "%Y-%m-%d").replace(tzinfo=timezone.utc)
    local_end = end.astimezone(NZ)
    cash_end = datetime(local_end.year, local_end.month, 1, tzinfo=timezone.utc)
    return query.filter(or_(
        and_(Transaction.source == "BANK", Transaction.transaction_date >= start, Transaction.transaction_date < end),
        and_(Transaction.source == "CASH", Transaction.transaction_date >= cash_start, Transaction.transaction_date < cash_end),
    ))
