
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from app.extensions import db
from app.models import BankConnection, BankAccount
from app.services.bank_crypto import decrypt_secret
from app.services.mock_bank_authorized import MockBankAuthorizedClient


class BankConfirmationError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


def confirm_bank_connection(user_id, connection_id, account_ids):
    # Validate the selected bank account IDs.
    if (
        not isinstance(account_ids, list)
        or not 1 <= len(account_ids) <= 25
    ):
        raise BankConfirmationError(
            "Select at least one bank account."
        )

    try:
        selected_ids = [
            str(UUID(value))
            for value in account_ids
            if isinstance(value, str)
        ]
    except (ValueError, TypeError, AttributeError):
        raise BankConfirmationError(
            "Invalid bank account selection."
        )

    if (
        len(selected_ids) != len(account_ids)
        or len(set(selected_ids)) != len(selected_ids)
    ):
        raise BankConfirmationError(
            "Invalid or duplicate bank account selection."
        )

    # Ensure the connection belongs to this SmartMoney user.
    connection = BankConnection.query.filter_by(
        id=connection_id,
        user_id=user_id
    ).first()

    if connection is None:
        raise BankConfirmationError(
            "Bank connection not found.",
            404
        )

    if connection.status != "PENDING":
        raise BankConfirmationError(
            "Bank connection is not awaiting confirmation.",
            409
        )

    if (
        not connection.access_token_encrypted
        or not connection.access_token_expires_at
    ):
        raise BankConfirmationError(
            "Bank authorisation is missing.",
            409
        )

    expiry = connection.access_token_expires_at

    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    if expiry <= datetime.now(timezone.utc):
        raise BankConfirmationError(
            "Bank authorisation has expired.",
            409
        )

    access_token = decrypt_secret(
        connection.access_token_encrypted
    )

    client = MockBankAuthorizedClient()

    # Fetch the account list directly from Mock Bank again.
    # Never trust account details or permissions from Angular.
    response = client.get_authorized_accounts(access_token)

    if (
        not isinstance(response, dict)
        or response.get("customer_id")
        != connection.external_customer_id
        or not isinstance(response.get("accounts"), list)
    ):
        raise BankConfirmationError(
            "Bank authorisation response is invalid.",
            502
        )

    authorized_accounts = {}

    try:
        for item in response["accounts"]:
            account_id = str(UUID(str(item["id"])))

            if account_id in authorized_accounts:
                raise ValueError("Duplicate bank account.")

            if item["status"] == "ACTIVE":
                authorized_accounts[account_id] = item

    except (KeyError, TypeError, ValueError, AttributeError):
        raise BankConfirmationError(
            "Invalid account information from Mock Bank.",
            502
        )

    # The customer can select only accounts previously
    # approved in Mock Bank's consent screen.
    if not set(selected_ids).issubset(authorized_accounts):
        raise BankConfirmationError(
            "One or more accounts are not authorised.",
            403
        )

    try:
        # Claim this pending connection only once.
        updated = BankConnection.query.filter_by(
            id=connection.id,
            user_id=user_id,
            status="PENDING"
        ).update(
            {"status": "CONNECTED"},
            synchronize_session=False
        )

        if updated != 1:
            db.session.rollback()
            raise BankConfirmationError(
                "Connection has already been confirmed.",
                409
            )

        # Disable accounts not included in this selection.
        # Existing transaction history is retained.
        BankAccount.query.filter_by(
            connection_id=connection.id
        ).update(
            {"is_connected": False},
            synchronize_session=False
        )

        for account_id in selected_ids:
            item = authorized_accounts[account_id]

            account = BankAccount.query.filter_by(
                connection_id=connection.id,
                external_account_id=account_id
            ).first()

            if account is None:
                account = BankAccount(
                    connection_id=connection.id,
                    external_account_id=account_id
                )
                db.session.add(account)

            account.account_name = item["account_name"]
            account.account_number = item.get("account_number")
            account.account_type = item["account_type"]
            account.currency = item["currency"]
            account.balance = Decimal(str(item["balance"]))
            account.status = item["status"]
            account.is_connected = True

        db.session.commit()

    except Exception:
        db.session.rollback()
        raise

    return {
        "connection_id": connection.id,
        "status": "CONNECTED",
        "accounts_connected": len(selected_ids)
    }
