
import re
from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
)
from app.extensions import db
from app.models import CashWallet, Transaction


cash_transactions_bp = Blueprint(
    "cash_transactions",
    __name__,
    url_prefix="/api/cash-transactions",
)

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("999999999999.99")


def parse_amount(value):
    if value is None or isinstance(value, bool):
        raise ValueError("A valid amount is required.")

    try:
        amount = Decimal(str(value))

        if not amount.is_finite():
            raise ValueError("Amount must be finite.")

        if amount <= 0 or amount > MAX_AMOUNT:
            raise ValueError(
                "Amount must be greater than zero "
                "and within the supported limit."
            )

        rounded = amount.quantize(CENT)

        if amount != rounded:
            raise ValueError(
                "Amount cannot have more than two decimal places."
            )

        return rounded

    except InvalidOperation:
        raise ValueError("Invalid transaction amount.")


def parse_transaction_date(value):
    if (
        not isinstance(value, str)
        or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)
    ):
        raise ValueError("Date must use YYYY-MM-DD format.")

    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ValueError("Invalid transaction date.")

    return datetime.combine(
        parsed,
        time.min,
        tzinfo=timezone.utc,
    )


def serialize_transaction(transaction):
    return {
        "id": transaction.id,
        "source": "cash",
        "assetId": transaction.cash_wallet_id,
        "type": transaction.transaction_type,
        "amount": str(abs(transaction.amount)),
        "category": transaction.category or "",
        "date": transaction.transaction_date.date().isoformat(),
        "note": transaction.note or "",
        "createdAt": transaction.created_at.isoformat(),
    }


@cash_transactions_bp.get("")
def get_cash_transactions():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    transactions = (
        Transaction.query
        .filter(
            Transaction.user_id == user_id,
            Transaction.source == "CASH",
            Transaction.cash_wallet_id.isnot(None),
        )
        .order_by(
            Transaction.transaction_date.desc(),
            Transaction.created_at.desc(),
        )
        .all()
    )

    response = jsonify({
        "transactions": [
            serialize_transaction(transaction)
            for transaction in transactions
        ],
        "count": len(transactions),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200


@cash_transactions_bp.post("")
@csrf_required
def create_cash_transaction():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON object is required."
        }), 400

    required = {
        "assetId",
        "type",
        "amount",
        "category",
        "date",
    }

    allowed = required | {"note"}

    if not required.issubset(data):
        return jsonify({
            "error": "Required transaction fields are missing."
        }), 400

    if not set(data).issubset(allowed):
        return jsonify({
            "error": "Unsupported transaction field."
        }), 400

    wallet_id = data["assetId"]
    transaction_type = data["type"]
    category = data["category"]
    note = data.get("note", "")

    if not isinstance(wallet_id, str) or not wallet_id:
        return jsonify({
            "error": "A valid cash wallet is required."
        }), 400

    if transaction_type not in ("income", "expense"):
        return jsonify({
            "error": "Transaction type must be income or expense."
        }), 400

    if not isinstance(category, str):
        return jsonify({
            "error": "Category must be text."
        }), 400

    category = category.strip()

    if not category or len(category) > 80:
        return jsonify({
            "error": "Category must be 1-80 characters."
        }), 400

    if not isinstance(note, str) or len(note) > 250:
        return jsonify({
            "error": "Note must be text with at most 250 characters."
        }), 400

    note = note.strip()

    try:
        amount = parse_amount(data["amount"])
        transaction_date = parse_transaction_date(
            data["date"]
        )
    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    # Lock the wallet to coordinate with archive operations.
    wallet = (
        CashWallet.query
        .filter_by(
            id=wallet_id,
            user_id=user_id,
            is_archived=False,
        )
        .with_for_update()
        .first()
    )

    if wallet is None:
        return jsonify({
            "error": "Cash wallet not found or archived."
        }), 404

    # Existing bank transactions use the BANK source.
    # Cash expenses are stored as negative amounts.
    signed_amount = (
        amount
        if transaction_type == "income"
        else -amount
    )

    transaction = Transaction(
        user_id=user_id,
        cash_wallet_id=wallet.id,
        bank_account_id=None,
        external_transaction_id=None,
        source="CASH",
        description=category,
        category=category,
        note=note,
        amount=signed_amount,
        currency=wallet.currency,
        transaction_type=transaction_type,
        transaction_date=transaction_date,
    )

    db.session.add(transaction)
    db.session.commit()

    response = jsonify({
        "message": "Cash transaction created successfully.",
        "transaction": serialize_transaction(transaction),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 201


@cash_transactions_bp.patch("/<transaction_id>")
@csrf_required
def update_cash_transaction(transaction_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict) or not data:
        return jsonify({
            "error": "A non-empty JSON object is required."
        }), 400

    allowed = {
        "assetId",
        "type",
        "amount",
        "category",
        "date",
        "note",
    }

    if not set(data).issubset(allowed):
        return jsonify({
            "error": "Unsupported transaction field."
        }), 400

    transaction = (
        Transaction.query
        .filter(
            Transaction.id == transaction_id,
            Transaction.user_id == user_id,
            Transaction.source == "CASH",
            Transaction.cash_wallet_id.isnot(None),
        )
        .with_for_update()
        .first()
    )

    if transaction is None:
        return jsonify({
            "error": "Cash transaction not found."
        }), 404

    wallet_id = data.get(
        "assetId",
        transaction.cash_wallet_id,
    )

    if not isinstance(wallet_id, str) or not wallet_id.strip():
        db.session.rollback()
        return jsonify({
            "error": "A valid cash wallet is required."
        }), 400

    transaction_type = data.get(
        "type",
        transaction.transaction_type,
    )

    if transaction_type not in ("income", "expense"):
        db.session.rollback()
        return jsonify({
            "error": "Invalid transaction type."
        }), 400

    category = data.get(
        "category",
        transaction.category or transaction.description,
    )

    if not isinstance(category, str):
        db.session.rollback()
        return jsonify({
            "error": "Category must be text."
        }), 400

    category = category.strip()

    if not category or len(category) > 80:
        db.session.rollback()
        return jsonify({
            "error": "Category must be 1-80 characters."
        }), 400

    note = data.get("note", transaction.note or "")

    if not isinstance(note, str) or len(note) > 250:
        db.session.rollback()
        return jsonify({
            "error": "Note must be text with at most 250 characters."
        }), 400

    try:
        amount = parse_amount(
            data.get("amount", abs(transaction.amount))
        )

        transaction_date = (
            parse_transaction_date(data["date"])
            if "date" in data
            else transaction.transaction_date
        )

    except ValueError as error:
        db.session.rollback()
        return jsonify({
            "error": str(error)
        }), 400

    # Both the original and destination wallets must be
    # active and belong to the authenticated user.
    wallet_ids = sorted({
        transaction.cash_wallet_id,
        wallet_id,
    })

    wallets = (
        CashWallet.query
        .filter(
            CashWallet.id.in_(wallet_ids),
            CashWallet.user_id == user_id,
            CashWallet.is_archived.is_(False),
        )
        .order_by(CashWallet.id)
        .with_for_update()
        .all()
    )

    if len(wallets) != len(wallet_ids):
        db.session.rollback()
        return jsonify({
            "error": "Cash wallet not found or archived."
        }), 404

    destination_wallet = next(
        wallet for wallet in wallets
        if wallet.id == wallet_id
    )

    transaction.cash_wallet_id = destination_wallet.id
    transaction.bank_account_id = None
    transaction.transaction_type = transaction_type
    transaction.amount = (
        amount if transaction_type == "income"
        else -amount
    )
    transaction.category = category
    transaction.description = category
    transaction.note = note.strip()
    transaction.transaction_date = transaction_date
    transaction.currency = destination_wallet.currency

    db.session.commit()

    response = jsonify({
        "message": "Cash transaction updated successfully.",
        "transaction": serialize_transaction(transaction),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200



@cash_transactions_bp.delete("/<transaction_id>")
@csrf_required
def delete_cash_transaction(transaction_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    # Only locate CASH transactions owned by this user.
    # Bank transactions must never be deleted here.
    transaction = (
        Transaction.query
        .filter(
            Transaction.id == transaction_id,
            Transaction.user_id == user_id,
            Transaction.source == "CASH",
            Transaction.cash_wallet_id.isnot(None),
        )
        .with_for_update()
        .first()
    )

    if transaction is None:
        return jsonify({
            "error": "Cash transaction not found."
        }), 404

    # Archived wallets retain their transaction history.
    # Lock the wallet to coordinate with archive operations.
    wallet = (
        CashWallet.query
        .filter_by(
            id=transaction.cash_wallet_id,
            user_id=user_id,
            is_archived=False,
        )
        .with_for_update()
        .first()
    )

    if wallet is None:
        db.session.rollback()

        return jsonify({
            "error": (
                "Transactions belonging to archived "
                "wallets cannot be deleted."
            )
        }), 404

    # Remove the incorrect transaction.
    # The wallet balance is calculated from remaining
    # PostgreSQL records, so no manual balance edit is needed.
    db.session.delete(transaction)
    db.session.commit()

    response = jsonify({
        "message": "Cash transaction deleted successfully."
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200
