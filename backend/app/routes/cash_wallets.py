
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import CashWallet, Transaction
from app.auth_security import (
    get_authenticated_user_id,
    csrf_required,
)

from sqlalchemy import func


cash_wallets_bp = Blueprint(
    "cash_wallets",
    __name__,
    url_prefix="/api/cash-wallets",
)

MAX_AMOUNT = Decimal("999999999999.99")
CENT = Decimal("0.01")


def parse_balance(value):
    if value is None or isinstance(value, bool):
        raise ValueError("A valid opening balance is required.")

    try:
        amount = Decimal(str(value))

        if not amount.is_finite():
            raise ValueError("Opening balance must be finite.")

        if amount < 0:
            raise ValueError("Opening balance cannot be negative.")

        if amount > MAX_AMOUNT:
            raise ValueError("Opening balance exceeds the limit.")

        rounded = amount.quantize(CENT)

        if amount != rounded:
            raise ValueError(
                "Opening balance cannot exceed two decimal places."
            )

        return rounded

    except InvalidOperation:
        raise ValueError("Invalid opening balance.")


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

def serialize_wallet(wallet):
    return {
        "id": wallet.id,
        "name": wallet.name,
        "currency": wallet.currency,
        "openingBalance": str(wallet.opening_balance),
        "currentBalance": str(calculate_wallet_balance(wallet)),
        "isArchived": wallet.is_archived,
        "createdAt": wallet.created_at.isoformat(),
        "updatedAt": wallet.updated_at.isoformat(),
    }


@cash_wallets_bp.get("")
def get_cash_wallets():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    wallets = (
        CashWallet.query
        .filter_by(
            user_id=user_id,
            is_archived=False,
        )
        .order_by(CashWallet.created_at.desc())
        .all()
    )

    response = jsonify({
        "wallets": [
            serialize_wallet(wallet)
            for wallet in wallets
        ],
        "count": len(wallets),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200


@cash_wallets_bp.post("")
@csrf_required
def create_cash_wallet():
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

    allowed_fields = {
        "name",
        "currency",
        "openingBalance",
    }

    if not set(data).issubset(allowed_fields):
        return jsonify({
            "error": "Unsupported wallet field."
        }), 400

    name = data.get("name")

    if not isinstance(name, str):
        return jsonify({
            "error": "Wallet name is required."
        }), 400

    name = name.strip()

    if not name or len(name) > 80:
        return jsonify({
            "error": "Wallet name must be 1–80 characters."
        }), 400

    currency = data.get("currency", "NZD")

    if not isinstance(currency, str):
        return jsonify({
            "error": "Invalid wallet currency."
        }), 400

    currency = currency.strip().upper()

    # NZD first for the current MVP.
    # Additional currencies require their own balance handling.
    if currency != "NZD":
        return jsonify({
            "error": "Only NZD wallets are currently supported."
        }), 400

    try:
        opening_balance = parse_balance(
            data.get("openingBalance", "0.00")
        )

    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    wallet = CashWallet(
        user_id=user_id,
        name=name,
        currency=currency,
        opening_balance=opening_balance,
        is_archived=False,
    )

    try:
        db.session.add(wallet)
        db.session.commit()

    except IntegrityError:
        db.session.rollback()

        return jsonify({
            "error": "A wallet with this name and currency already exists."
        }), 409

    response = jsonify({
        "message": "Cash wallet created successfully.",
        "wallet": serialize_wallet(wallet),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 201


@cash_wallets_bp.patch("/<wallet_id>")
@csrf_required
def update_cash_wallet(wallet_id):
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

    allowed_fields = {"name", "openingBalance"}

    if not set(data).issubset(allowed_fields):
        return jsonify({
            "error": "Unsupported wallet field."
        }), 400

    changes = {}

    if "name" in data:
        name = data["name"]

        if not isinstance(name, str):
            return jsonify({
                "error": "Wallet name must be text."
            }), 400

        name = name.strip()

        if not name or len(name) > 80:
            return jsonify({
                "error": "Wallet name must be 1–80 characters."
            }), 400

        changes["name"] = name

    if "openingBalance" in data:
        try:
            changes["opening_balance"] = parse_balance(
                data["openingBalance"]
            )
        except ValueError as error:
            return jsonify({
                "error": str(error)
            }), 400

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
            "error": "Cash wallet not found."
        }), 404

    if (
        "opening_balance" in changes
        and changes["opening_balance"] != wallet.opening_balance
    ):
        has_transactions = (
            db.session.query(Transaction.id)
            .filter_by(cash_wallet_id=wallet.id)
            .first()
        )

        if has_transactions is not None:
            db.session.rollback()

            return jsonify({
                "error": (
                    "Opening balance cannot be changed "
                    "after transactions have been recorded."
                )
            }), 409

    for field, value in changes.items():
        setattr(wallet, field, value)

    try:
        db.session.commit()

    except IntegrityError:
        db.session.rollback()

        return jsonify({
            "error": (
                "A wallet with this name and currency "
                "already exists."
            )
        }), 409

    response = jsonify({
        "message": "Cash wallet updated successfully.",
        "wallet": serialize_wallet(wallet),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200


@cash_wallets_bp.patch("/<wallet_id>/archive")
@csrf_required
def archive_cash_wallet(wallet_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    wallet = (
        CashWallet.query
        .filter_by(
            id=wallet_id,
            user_id=user_id,
        )
        .with_for_update()
        .first()
    )

    if wallet is None:
        return jsonify({
            "error": "Cash wallet not found."
        }), 404

    if wallet.is_archived:
        response = jsonify({
            "message": "Cash wallet is already archived.",
            "wallet": serialize_wallet(wallet),
        })
        response.headers["Cache-Control"] = "no-store"
        return response, 200

    # Archive without deleting transactions or balances.
    wallet.is_archived = True

    db.session.commit()

    response = jsonify({
        "message": "Cash wallet archived successfully.",
        "wallet": serialize_wallet(wallet),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200
