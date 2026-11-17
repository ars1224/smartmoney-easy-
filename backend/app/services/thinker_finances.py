"""Read-only, deterministic financial answers. No records or prompts leave the server."""
import re
from datetime import datetime, timedelta, timezone
from sqlalchemy import and_, or_
from app.models import BankAccount, BankConnection, CashWallet, Transaction
from app.services.report_transactions import report_transactions
from app.services.reports import NZ, money, report_month, summarise
from app.services.wallet_balance import calculate_wallet_balance


def financial_intent(message):
    text = message.casefold()
    # App instructions and general education continue through the public guide.
    if text.startswith("how do i") or text.startswith("how to") or "difference between" in text:
        return None
    if any(word in text for word in ("latest transaction", "last transaction", "recent transactions", "my transactions", "last purchase", "latest purchase")):
        return "transactions"
    if any(word in text for word in ("my balance", "current balance", "bank balance", "wallet balance", "my balances", "how much money do i have")):
        return "balances"
    if any(word in text for word in ("my finances", "financial overview", "state of finances", "financial status", "my cash flow", "my spending", "how much did i spend", "my income")):
        return "overview"
    return None


def owned_transactions(user_id):
    return Transaction.query.outerjoin(BankAccount, Transaction.bank_account_id == BankAccount.id).outerjoin(
        BankConnection, BankAccount.connection_id == BankConnection.id
    ).filter(Transaction.user_id == user_id, or_(
        Transaction.source == "CASH",
        and_(Transaction.source == "BANK", BankConnection.user_id == user_id),
    ))


def financial_reply(user_id, message, now=None):
    intent = financial_intent(message)
    if not intent:
        return None
    now = now or datetime.now(timezone.utc)
    local_now = now.astimezone(NZ)
    text = message.casefold()
    if re.search(r"\b(?:another|other) (?:user|client|person)\b", text):
        return reply("Private account data", "I can only show records belonging to your signed-in SmartMoney account. I cannot retrieve another person's finances.", "activity")
    if intent == "balances" and (re.search(r"\b[0-9]{4}-[0-9]{2}\b", text) or any(word in text for word in ("last month", "previous", "yesterday", "last year"))):
        return reply("Historical balances unavailable", "SmartMoney only exposes the latest saved balances here, not historical balance snapshots. Reports can show recorded cash flow for a selected month; cash flow is not a past balance.", "reports")
    if intent == "balances":
        wallets = CashWallet.query.filter_by(user_id=user_id, is_archived=False).order_by(CashWallet.id).all()
        accounts = BankAccount.query.join(BankConnection).filter(
            BankConnection.user_id == user_id, BankConnection.status == "CONNECTED",
            BankAccount.is_connected.is_(True), BankAccount.status == "ACTIVE",
        ).order_by(BankAccount.id).all()
        lines = ["Saved balances, not a live bank check. Currencies are separate; these are not safe-to-spend figures."]
        if not wallets and not accounts:
            lines.append("No active cash wallets or connected active bank accounts are recorded. This does not establish that your balance is zero.")
        for index, wallet in enumerate(wallets, 1):
            lines.append(f"Cash wallet {index}: {wallet.currency} {money(calculate_wallet_balance(wallet))} (opening balance plus recorded cash transactions).")
        for index, account in enumerate(accounts, 1):
            connection = BankConnection.query.filter_by(id=account.connection_id, user_id=user_id).one()
            stamp = connection.last_synced_at.isoformat() if connection.last_synced_at else "not recorded"
            lines.append(f"Bank account {index}: {account.currency} {money(account.balance)}. Connection last sync attempt: {stamp}; this may include partial sync and does not guarantee this account was refreshed.")
        lines.append("Archived wallets and disconnected/inactive bank accounts are excluded. Check Profile & Assets and the sync result before relying on bank figures.")
        return reply("Your saved balances", "\n".join(lines), "profile")
    selected = re.search(r"\b[0-9]{4}-[0-9]{2}\b", text)
    historical = any(word in text for word in ("last month", "previous month", "last year", "yesterday"))
    if historical and not selected:
        return reply("Choose a reporting period", "For a historical summary, include a month as YYYY-MM, for example: my finances 2026-10. Otherwise I use the current Auckland calendar month. Use Reports for other date filters.", "reports")
    if intent == "transactions":
        query = owned_transactions(user_id)
        if selected:
            month, start, end = report_month(selected.group())
            query = report_transactions(user_id, month, "all", start, end).filter(Transaction.id.in_(query.with_entities(Transaction.id)))
        query = query.filter(or_(and_(Transaction.source == "BANK", Transaction.transaction_date <= now),
            and_(Transaction.source == "CASH", Transaction.transaction_date < local_now.replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=timezone.utc) + timedelta(days=1))))
        rows = query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).limit(5 if "transactions" in text else 1).all()
        lines = ["Latest saved records by transaction date, not a live bank check. Cash dates do not establish an exact time; records on the same date may tie."]
        if not rows:
            lines.append("No matching saved transactions were found for your account.")
        for row in rows:
            date = row.transaction_date.date() if row.source == "CASH" else (row.transaction_date.replace(tzinfo=timezone.utc) if row.transaction_date.tzinfo is None else row.transaction_date).astimezone(NZ).date()
            # Descriptions are rendered as plain text, never sent to the model as instructions.
            lines.append(f"{date.isoformat()} | {row.source} | {row.currency} {money(row.amount)} | {(row.description or 'Transaction')[:120]} | {(row.category or 'Uncategorised')[:60]}")
        lines.append("Dates are cash calendar dates or bank dates in Pacific/Auckland. Missing/unsynced history may change what is latest.")
        return reply("Your saved transactions", "\n".join(lines), "activity")
    month, start, end = report_month(selected.group() if selected else None)
    rows = report_transactions(user_id, month, "all", start, end).filter(Transaction.id.in_(owned_transactions(user_id).with_entities(Transaction.id))).all()
    summary = summarise(rows, month, "all")
    lines = [f"{month} recorded NZD cash flow (all saved sources):",
        f"Recorded income: NZD {summary['income']}. Expenses: NZD {summary['expenses']}. Refunds: NZD {summary['refunds']}.",
        f"Uncategorised bank inflows: NZD {summary['uncategorisedInflows']} (not confirmed income). Net cash flow: NZD {summary['netCashFlow']}.",
        "Net cash flow = income + refunds + uncategorised inflows - expenses. It is not your bank balance, available money or expected payroll.",
        f"Included transactions: {summary['transactionCount']}; uncategorised expenses: {summary['uncategorisedCount']}. Excluded: {summary['excluded']['transfers']} transfers, {summary['excluded']['foreignCurrency']} foreign-currency records, {summary['excluded']['reviewNeeded']} records needing review."]
    if not rows:
        lines.append("No saved records match this month; zero recorded movement does not mean zero money.")
    lines.append("This snapshot cannot assess overall financial health, debt or affordability. Bank data depends on saved sync history. Review Reports and Profile & Assets.")
    return reply("Your recorded financial overview", "\n".join(lines), "reports")


def reply(title, message, page):
    return {"mode": "records", "title": title, "message": message,
            "takeaway": "Check the linked page for full details and data freshness.", "links": [{"id": page}]}
