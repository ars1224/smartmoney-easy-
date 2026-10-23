
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4

from app import create_app
from app.extensions import db
from app.models import (
    User,
    BankConnection,
    BankAccount,
    BankOAuthAttempt,
    Transaction,
)
from app.services.bank_crypto import (
    encrypt_secret,
)


app = create_app()
app.config["TESTING"] = True

owner_email = f"disconnect-owner-{uuid4().hex}@example.test"
other_email = f"disconnect-other-{uuid4().hex}@example.test"
password = "SmartMoneyDisconnectTest!2026"

customer_id = str(uuid4())
account_id = str(uuid4())
transaction_id = str(uuid4())
test_token = "temporary-disconnect-test-token"


def register(client, email):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200

    csrf = response.get_json()["csrf_token"]

    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
        },
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 201, response.get_json()

    data = response.get_json()
    return data["user"]["id"], data["csrf_token"]


try:
    with app.app_context():
        original_accounts = BankAccount.query.count()
        original_transactions = Transaction.query.count()

    owner_client = app.test_client()
    other_client = app.test_client()

    owner_id, owner_csrf = register(
        owner_client, owner_email
    )
    other_id, other_csrf = register(
        other_client, other_email
    )

    print("SmartMoney users authenticated: OK")

    # Create a temporary authorised connection.
    with app.app_context():
        connection = BankConnection(
            user_id=owner_id,
            provider="MOCK_BANK",
            external_customer_id=customer_id,
            status="PENDING",
            access_token_encrypted=encrypt_secret(test_token),
            access_token_expires_at=(
                datetime.now(timezone.utc)
                + timedelta(days=1)
            ),
        )

        db.session.add(connection)
        db.session.commit()

        connection_id = connection.id

    print("Temporary connection created: OK")

    # Simulate Mock Bank.
    with (
        patch(
            "app.services.bank_oauth_confirm."
            "MockBankAuthorizedClient"
        ) as confirm_class,
        patch(
            "app.services.bank_sync."
            "MockBankAuthorizedClient"
        ) as sync_class,
        patch(
            "app.routes.bank_accounts."
            "MockBankAuthorizedClient"
        ) as disconnect_class,
    ):
        confirm_bank = confirm_class.return_value
        sync_bank = sync_class.return_value
        disconnect_bank = disconnect_class.return_value

        confirm_bank.get_authorized_accounts.return_value = {
            "customer_id": customer_id,
            "accounts": [
                {
                    "id": account_id,
                    "account_name": "Test Everyday Account",
                    "account_number": "1234560001",
                    "account_type": "EVERYDAY",
                    "currency": "NZD",
                    "balance": "487.50",
                    "status": "ACTIVE",
                }
            ],
        }

        sync_bank.get_account_balance.return_value = {
            "account_id": account_id,
            "currency": "NZD",
            "balance": "487.50",
            "status": "ACTIVE",
        }

        sync_bank.get_account_transactions.return_value = {
            "account_id": account_id,
            "currency": "NZD",
            "status": "ACTIVE",
            "transactions": [
                {
                    "id": transaction_id,
                    "transaction_date": (
                        "2026-10-18T09:00:00+00:00"
                    ),
                    "description": "Test Grocery Purchase",
                    "amount": "-12.50",
                    "balance_after": "487.50",
                    "transaction_type": "DEBIT",
                }
            ],
        }

        # 1. Confirm and sync a temporary account.
        response = owner_client.post(
            "/api/bank/oauth/confirm",
            json={
                "connection_id": connection_id,
                "account_ids": [account_id],
            },
            headers={"X-CSRF-Token": owner_csrf},
        )

        assert response.status_code == 200, response.get_json()
        assert response.get_json()["sync_status"] == "SUCCESS"

        print("Bank confirmed and synced: OK")

        # 2. Verify the imported transaction exists.
        with app.app_context():
            account = BankAccount.query.filter_by(
                connection_id=connection_id,
                external_account_id=account_id,
            ).one()

            assert account.is_connected is True
            stored_account_id = account.id

            transaction = Transaction.query.filter_by(
                user_id=owner_id,
                bank_account_id=stored_account_id,
                external_transaction_id=transaction_id,
            ).one()

            stored_transaction_id = transaction.id

        print("Transaction imported: OK")

        disconnect_url = (
            f"/api/bank/connections/"
            f"{connection_id}/disconnect"
        )

        # 3. Another user must not disconnect it.
        response = other_client.post(
            disconnect_url,
            headers={"X-CSRF-Token": other_csrf},
        )

        print("Other user disconnect:", response.status_code)
        assert response.status_code == 404
        disconnect_bank.revoke_access.assert_not_called()

        # 4. Owner disconnects successfully.
        response = owner_client.post(
            disconnect_url,
            headers={"X-CSRF-Token": owner_csrf},
        )

        print("Owner disconnect:", response.status_code)
        assert response.status_code == 200, response.get_json()

        result = response.get_json()
        assert result["status"] == "DISCONNECTED"
        assert result["transaction_history_preserved"] is True

        # Verify Mock Bank token revocation was requested.
        disconnect_bank.revoke_access.assert_called_once_with(
            test_token
        )

        print("Mock Bank access revoked: OK")

        # 5. Verify local database state.
        with app.app_context():
            connection = db.session.get(
                BankConnection,
                connection_id,
            )

            assert connection.status == "DISCONNECTED"
            assert connection.access_token_encrypted is None
            assert connection.access_token_expires_at is None

            print("Encrypted credential cleared: OK")

            account = db.session.get(
                BankAccount,
                stored_account_id,
            )

            assert account is not None
            assert account.is_connected is False

            print("Bank account disabled: OK")

            transaction = db.session.get(
                Transaction,
                stored_transaction_id,
            )

            assert transaction is not None
            assert transaction.user_id == owner_id
            assert transaction.external_transaction_id == transaction_id

            print("Transaction history preserved: OK")

        # 6. Repeated disconnection should be harmless.
        response = owner_client.post(
            disconnect_url,
            headers={"X-CSRF-Token": owner_csrf},
        )

        print("Repeated disconnect:", response.status_code)
        assert response.status_code == 200
        assert response.get_json()["status"] == "DISCONNECTED"

        # Remote revocation should not happen a second time.
        assert disconnect_bank.revoke_access.call_count == 1

        print("Repeated disconnect handled: OK")

        with app.app_context():
            assert BankAccount.query.count() == original_accounts + 1
            assert Transaction.query.count() == original_transactions + 1

        print("Existing financial data preserved: OK")
        print("\nALL BANK DISCONNECT TESTS PASSED!")

finally:
    # Remove records belonging only to the temporary users.
    with app.app_context():
        db.session.rollback()

        users = User.query.filter(
            User.email.in_([owner_email, other_email])
        ).all()

        user_ids = [user.id for user in users]

        if user_ids:
            connections = BankConnection.query.filter(
                BankConnection.user_id.in_(user_ids)
            ).all()

            connection_ids = [
                connection.id for connection in connections
            ]

            Transaction.query.filter(
                Transaction.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            if connection_ids:
                BankAccount.query.filter(
                    BankAccount.connection_id.in_(connection_ids)
                ).delete(synchronize_session=False)

                BankConnection.query.filter(
                    BankConnection.id.in_(connection_ids)
                ).delete(synchronize_session=False)

            BankOAuthAttempt.query.filter(
                BankOAuthAttempt.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            User.query.filter(
                User.id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.session.commit()

        print("Temporary disconnect test data cleaned up.")
