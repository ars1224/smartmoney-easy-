
from flask import Blueprint, jsonify, current_app

from app.extensions import db
from app.models import BankConnection, BankAccount
from app.services.bank_sync import (
    sync_bank_connection,
    BankReauthorizationRequired,
)
from app.services.mock_bank import MockBankError
from app.auth_security import get_authenticated_user_id, csrf_required

from datetime import datetime, timezone

from app.services.bank_crypto import (
    decrypt_secret,
    BankEncryptionError,
)
from app.services.mock_bank_authorized import (
    MockBankAuthorizedClient,
)




bank_accounts_bp = Blueprint(
    "bank_accounts",
    __name__,
    url_prefix="/api/bank"
)


@bank_accounts_bp.get("/accounts")
def get_bank_accounts():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    records = (
        db.session.query(BankAccount, BankConnection)
        .join(
            BankConnection,
            BankAccount.connection_id == BankConnection.id
        )
        .filter(
            BankConnection.user_id == user_id,
            BankConnection.status == "CONNECTED",
            BankAccount.is_connected.is_(True)
        )
        .all()
    )

    accounts = []

    for account, connection in records:
        accounts.append({
            "id": account.id,
            "connection_id": connection.id,
            "account_name": account.account_name,
            "account_number_last4": (
                (account.account_number or "")[-4:]
            ),
            "account_type": account.account_type,
            "currency": account.currency,
            "balance": str(account.balance),
            "status": account.status,
            "last_synced_at": (
                connection.last_synced_at.isoformat()
                if connection.last_synced_at else None
            )
        })

    response = jsonify({
        "accounts": accounts,
        "count": len(accounts)
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200

@bank_accounts_bp.post("/connections/<connection_id>/sync")
@csrf_required
def sync_bank_accounts(connection_id):
    user_id = get_authenticated_user_id()
    
    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    connection = db.session.get(
        BankConnection,
        connection_id
    )

    if connection is None or connection.user_id != user_id:
        return jsonify({
            "error": "Bank connection not found."
        }), 404

    if connection.status != "CONNECTED":
        return jsonify({
            "error": "Bank connection is not active."
        }), 409

    try:
        result = sync_bank_connection(connection.id)
        return jsonify(result), 200

    except MockBankError:
        current_app.logger.exception(
            "Mock Bank synchronisation failed."
        )
        return jsonify({
            "error": "Unable to synchronise bank data."
        }), 502

    except BankReauthorizationRequired:
        return jsonify({
            "error": "Bank authorisation is required.",
            "action": "reconnect"
        }), 409

    except Exception:
        current_app.logger.exception(
            "Unexpected bank synchronisation error."
        )
        return jsonify({
            "error": "Bank synchronisation failed."
        }), 500

@bank_accounts_bp.post(
    "/connections/<connection_id>/disconnect"
)
@csrf_required
def disconnect_bank_connection(connection_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    connection = BankConnection.query.filter_by(
        id=connection_id,
        user_id=user_id
    ).first()

    if connection is None:
        return jsonify({
            "error": "Bank connection not found."
        }), 404

    if connection.status == "DISCONNECTED":
        return jsonify({
            "status": "DISCONNECTED",
            "message": "Bank is already disconnected."
        }), 200

    if connection.status not in (
        "CONNECTED",
        "PENDING",
        "DISCONNECTING"
    ):
        return jsonify({
            "error": "Bank connection cannot be disconnected."
        }), 409

    # Stop new synchronisation requests immediately.
    if connection.status != "DISCONNECTING":
        connection.status = "DISCONNECTING"
        db.session.commit()

    # Revoke the Mock Bank grant before deleting
    # the locally encrypted credential.
    if connection.access_token_encrypted:
        try:
            token = decrypt_secret(
                connection.access_token_encrypted
            )

            expires_at = connection.access_token_expires_at

            if expires_at is None:
                return jsonify({
                    "error": "Bank token expiry is missing.",
                    "action": "retry_disconnect"
                }), 409

            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(
                    tzinfo=timezone.utc
                )

            if expires_at > datetime.now(timezone.utc):
                client = MockBankAuthorizedClient()

                try:
                    client.revoke_access(token)

                except MockBankError as error:
                    current_app.logger.warning(
                        "Mock Bank revocation could not be confirmed. Status: %s",
                        error.status_code
                    )

                    return jsonify({
                        "status": "DISCONNECTING",
                        "error": "Unable to confirm bank access revocation.",
                        "action": "retry_disconnect"
                    }), 502

                    # A rejected token cannot access the
                    # authorised Mock Bank API.

        except BankEncryptionError:
            current_app.logger.exception(
                "Unable to decrypt bank connection credential."
            )

            return jsonify({
                "status": "DISCONNECTING",
                "error": "Bank credential could not be read."
            }), 500

    try:
        # Preserve account records and transaction history.
        BankAccount.query.filter_by(
            connection_id=connection.id
        ).update(
            {"is_connected": False},
            synchronize_session=False
        )

        connection.status = "DISCONNECTED"
        connection.access_token_encrypted = None
        connection.access_token_expires_at = None

        db.session.commit()

    except Exception:
        db.session.rollback()
        current_app.logger.exception(
            "Failed to finalise bank disconnection."
        )

        return jsonify({
            "error": "Unable to finalise bank disconnection."
        }), 500

    response = jsonify({
        "status": "DISCONNECTED",
        "connection_id": connection.id,
        "message": "Bank disconnected successfully.",
        "transaction_history_preserved": True
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200
