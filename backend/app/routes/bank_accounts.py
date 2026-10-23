from flask import Blueprint, jsonify, current_app

from app.extensions import db
from app.models import BankConnection, BankAccount
from app.services.bank_sync import (
    sync_bank_connection,
    BankReauthorizationRequired,
)
from app.services.mock_bank import MockBankError
from app.auth_security import get_authenticated_user_id, csrf_required

from app.services.bank_crypto import (
    decrypt_secret,
    BankEncryptionError,
)
from app.services.mock_bank_authorized import (
    MockBankAuthorizedClient,
)

from datetime import datetime, timezone

bank_accounts_bp = Blueprint(
    "bank_accounts",
    __name__,
    url_prefix="/api/bank"
)


@bank_accounts_bp.get("/connections/pending")
def get_pending_bank_connections():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    connections = (
        BankConnection.query.filter_by(
            user_id=user_id,
            status="PENDING"
        )
        .order_by(BankConnection.created_at.desc())
        .all()
    )

    pending = []

    for connection in connections:
        expiry = connection.access_token_expires_at

        if expiry is not None and expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)

        expired = (
            expiry is None
            or expiry <= datetime.now(timezone.utc)
            or not connection.access_token_encrypted
        )

        status = "EXPIRED" if expired else "PENDING"
        accounts = []

        if not expired:
            try:
                token = decrypt_secret(
                    connection.access_token_encrypted
                )

                bank = MockBankAuthorizedClient()
                response = bank.get_authorized_accounts(token)

                if (
                    response.get("customer_id")
                    != connection.external_customer_id
                    or not isinstance(response.get("accounts"), list)
                ):
                    return jsonify({
                        "error": "Invalid bank account response."
                    }), 502

                for item in response["accounts"]:
                    if item.get("status") != "ACTIVE":
                        continue

                    accounts.append({
                        "id": item["id"],
                        "account_name": item["account_name"],
                        "account_type": item["account_type"],
                        "account_number_last4": (
                            item.get("account_number") or ""
                        )[-4:],
                        "currency": item["currency"],
                        "status": item["status"],
                    })

            except MockBankError as error:
                if error.status_code in (401, 403):
                    status = "EXPIRED"
                else:
                    current_app.logger.warning(
                        "Unable to retrieve pending bank accounts. "
                        "Status: %s",
                        error.status_code
                    )

                    return jsonify({
                        "error": "Unable to retrieve bank accounts."
                    }), 502

            except BankEncryptionError:
                current_app.logger.exception(
                    "Unable to decrypt pending bank credential."
                )
                return jsonify({
                    "error": "Unable to read bank connection."
                }), 500

            except (KeyError, TypeError, AttributeError):
                current_app.logger.exception(
                    "Invalid pending bank account data."
                )
                return jsonify({
                    "error": "Invalid bank account response."
                }), 502

        pending.append({
            "connection_id": connection.id,
            "status": status,
            "expires_at": (
                expiry.isoformat() if expiry else None
            ),
            "accounts": accounts,
        })

    response = jsonify({
        "connections": pending,
        "count": len(pending),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200


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

    # Attempt revocation whenever a credential exists.
    # A missing or expired local expiry timestamp must not
    # prevent the user from disconnecting.
    if connection.access_token_encrypted:
        try:
            token = decrypt_secret(
                connection.access_token_encrypted
            )

        except BankEncryptionError:
            current_app.logger.exception(
                "Unable to decrypt bank connection credential."
            )

            return jsonify({
                "status": "DISCONNECTING",
                "error": "Bank credential could not be read.",
                "action": "contact_support"
            }), 500

        try:
            client = MockBankAuthorizedClient()
            client.revoke_access(token)

        except MockBankError as error:
            if error.status_code in (401, 403):
                # Credential has been rejected by Mock Bank.
                # No further authorised requests can be made
                # using this token, so complete local cleanup.
                current_app.logger.info(
                    "Bank credential rejected during revocation. "
                    "Completing local disconnection."
                )

            else:
                # Temporary or unconfirmed failures must
                # preserve the credential for a future retry.
                current_app.logger.warning(
                    "Unable to confirm bank revocation. "
                    "HTTP status: %s",
                    error.status_code
                )

                return jsonify({
                    "status": "DISCONNECTING",
                    "error": "Unable to confirm bank access revocation.",
                    "action": "retry_disconnect"
                }), 502

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
            "status": "DISCONNECTING",
            "error": "Unable to finalise bank disconnection.",
            "action": "retry_disconnect"
        }), 500

    response = jsonify({
        "status": "DISCONNECTED",
        "connection_id": connection.id,
        "message": "Bank disconnected successfully.",
        "transaction_history_preserved": True
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200
