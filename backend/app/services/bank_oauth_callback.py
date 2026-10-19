
import hashlib
import re
from datetime import datetime, timezone

from app.extensions import db
from app.models import BankOAuthAttempt, BankConnection
from app.services.bank_crypto import (
    decrypt_secret,
    encrypt_secret,
)
from app.services.mock_bank_authorized import (
    MockBankAuthorizedClient,
)

from flask import current_app


class BankOAuthCallbackError(Exception):
    pass


def complete_bank_authorization(
    user_id,
    state,
    authorization_code,
    client_id,
    redirect_uri,
):
    if (
        not isinstance(state, str)
        or not re.fullmatch(r"[A-Za-z0-9_-]{43}", state)
        or not isinstance(authorization_code, str)
        or not re.fullmatch(
            r"[A-Za-z0-9_-]{43}",
            authorization_code
        )
    ):
        raise BankOAuthCallbackError(
            "Invalid bank authorization response."
        )

    state_hash = hashlib.sha256(
        state.encode("ascii")
    ).hexdigest()

    now = datetime.now(timezone.utc)

    # Find the pending OAuth request belonging
    # to the authenticated SmartMoney user.
    attempt = BankOAuthAttempt.query.filter(
        BankOAuthAttempt.user_id == user_id,
        BankOAuthAttempt.state_hash == state_hash,
        BankOAuthAttempt.consumed_at.is_(None),
        BankOAuthAttempt.expires_at > now,
    ).with_for_update().first()

    if attempt is None:
        raise BankOAuthCallbackError(
            "Bank authorization request is invalid or expired."
        )

    verifier = decrypt_secret(
        attempt.code_verifier_encrypted
    )

    # Consume the state before contacting Mock Bank.
    # Failed exchanges require starting a new connection.
    attempt.consumed_at = now
    db.session.commit()

    client = MockBankAuthorizedClient()
    access_token = None
    stored = False

    try:
        exchange = client.exchange_authorization_code(
            code=authorization_code,
            code_verifier=verifier,
            client_id=client_id,
            redirect_uri=redirect_uri,
        )

        access_token = exchange["access_token"]
        customer_id = exchange["customer_id"]

        # Retrieve accounts using the account-scoped
        # access token, not the broad API key.
        account_response = client.get_authorized_accounts(
            access_token
        )

        accounts = account_response["accounts"]
        approved_ids = set(exchange["approved_account_ids"])

        if (
            not isinstance(accounts, list)
            or not accounts
            or not approved_ids
            or {a["id"] for a in accounts} != approved_ids
            or account_response["customer_id"] != customer_id
        ):
            raise BankOAuthCallbackError(
                "Bank account authorization mismatch."
            )

        expires_at = datetime.fromisoformat(
            exchange["expires_at"].replace("Z", "+00:00")
        )

        if (
            expires_at.tzinfo is None
            or expires_at <= datetime.now(timezone.utc)
        ):
            raise BankOAuthCallbackError(
                "Invalid bank access token expiry."
            )

        connection = BankConnection.query.filter_by(
            user_id=user_id,
            provider="MOCK_BANK",
            external_customer_id=customer_id
        ).with_for_update().first()

        # Never replace an existing bank grant while the
        # previous connection is active or being disconnected.
        if connection and (
            connection.status != "DISCONNECTED"
            or connection.access_token_encrypted is not None
        ):
            raise BankOAuthCallbackError(
                "An existing bank connection must be "
                "fully disconnected before reconnecting."
        )

        if connection is None:
            connection = BankConnection(
                user_id=user_id,
                provider="MOCK_BANK",
                external_customer_id=customer_id,
            )
            db.session.add(connection)

        # Keep pending until the user confirms
        # which approved accounts to add.
        connection.status = "PENDING"
        connection.access_token_encrypted = encrypt_secret(
            access_token
        )
        connection.access_token_expires_at = expires_at

        db.session.commit()
        stored = True

        return {
            "connection_id": connection.id,
            "status": "PENDING",
            "accounts": [
                {
                    "id": item["id"],
                    "account_name": item["account_name"],
                    "account_type": item["account_type"],
                    "currency": item["currency"],
                    "status": item["status"],
                    "account_number_last4": (
                        item.get("account_number") or ""
                    )[-4:],
                }
                for item in accounts
            ]
        }

    except Exception:
        db.session.rollback()
        raise

    finally:
        # Revoke an issued grant if we couldn't
        # safely store the pending connection.
        if access_token and not stored:
            try:
                client.revoke_access(access_token)
            except Exception:
                current_app.logger.warning(
                    "Unable to revoke a newly issued "
                    "bank grant after OAuth callback failure."
                )