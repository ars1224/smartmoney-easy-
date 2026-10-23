
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
from app.services.bank_crypto import encrypt_secret
from app.services.bank_sync import sync_bank_connection


app = create_app()
app.config["TESTING"] = True

owner_email = f"confirm-owner-{uuid4().hex}@example.test"
other_email = f"confirm-other-{uuid4().hex}@example.test"
password = "SmartMoneyConfirmTest!2026"

customer_id = str(uuid4())
approved_id = str(uuid4())
second_account_id = str(uuid4())
invalid_id = str(uuid4())
transaction_id = str(uuid4())

test_token = "temporary-test-token"


def register(client, email):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200

    csrf = response.get_json()["csrf_token"]

    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password
        },
        headers={"X-CSRF-Token": csrf}
    )

    assert response.status_code == 201, response.get_json()

    data = response.get_json()

    return data["user"]["id"], data["csrf_token"]


def account_data(account_id, name):
    return {
        "id": account_id,
        "account_name": name,
        "account_number": "1234560001",
        "account_type": "EVERYDAY",
        "currency": "NZD",
        "balance": "487.50",
        "status": "ACTIVE",
    }


try:
    with app.app_context():
        original_accounts = BankAccount.query.count()
        original_transactions = Transaction.query.count()

    owner_client = app.test_client()
    other_client = app.test_client()

    # 1. Create two authenticated SmartMoney users.
    owner_id, owner_csrf = register(
        owner_client, owner_email
    )

    other_id, other_csrf = register(
        other_client, other_email
    )

    print("SmartMoney users authenticated: OK")

    # 2. Create a temporary pending connection.
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
            )
        )

        db.session.add(connection)
        db.session.commit()

        connection_id = connection.id

    print("Pending connection created: OK")

    # 3. Simulate the authorized Mock Bank API.
    with (
        patch(
            "app.services.bank_oauth_confirm.MockBankAuthorizedClient"
        ) as confirm_class,
        patch(
            "app.services.bank_sync.MockBankAuthorizedClient"
        ) as sync_class
    ):
        confirm_bank = confirm_class.return_value
        sync_bank = sync_class.return_value

        confirm_bank.get_authorized_accounts.return_value = {
            "customer_id": customer_id,
            "accounts": [
                account_data(
                    approved_id,
                    "Test Everyday Account"
                ),
                account_data(
                    second_account_id,
                    "Test Savings Account"
                ),
            ]
        }

        sync_bank.get_account_balance.return_value = {
            "account_id": approved_id,
            "currency": "NZD",
            "balance": "487.50",
            "status": "ACTIVE"
        }

        sync_bank.get_account_transactions.return_value = {
            "account_id": approved_id,
            "currency": "NZD",
            "status": "ACTIVE",
            "transactions": [
                {
                    "id": transaction_id,
                    "transaction_date":
                        "2026-10-18T09:00:00+00:00",
                    "description": "Test Grocery Purchase",
                    "amount": "-12.50",
                    "balance_after": "487.50",
                    "transaction_type": "DEBIT"
                }
            ]
        }

        # 4. Another user cannot confirm this connection.
        response = other_client.post(
            "/api/bank/oauth/confirm",
            json={
                "connection_id": connection_id,
                "account_ids": [approved_id]
            },
            headers={"X-CSRF-Token": other_csrf}
        )

        print("Other user confirmation:", response.status_code)
        assert response.status_code == 404

        # 5. Reject an account not approved by the bank.
        response = owner_client.post(
            "/api/bank/oauth/confirm",
            json={
                "connection_id": connection_id,
                "account_ids": [invalid_id]
            },
            headers={"X-CSRF-Token": owner_csrf}
        )

        print("Unapproved account:", response.status_code)
        assert response.status_code == 403

        # 6. Confirm only the Everyday Account.
        response = owner_client.post(
            "/api/bank/oauth/confirm",
            json={
                "connection_id": connection_id,
                "account_ids": [approved_id]
            },
            headers={"X-CSRF-Token": owner_csrf}
        )

        print("Valid confirmation:", response.status_code)
        assert response.status_code == 200, response.get_json()

        result = response.get_json()

        assert result["status"] == "CONNECTED"
        assert result["accounts_connected"] == 1
        assert result["sync_status"] == "SUCCESS"
        assert result["sync"]["accounts_synced"] == 1
        assert result["sync"]["transactions_imported"] == 1

        print("Initial sync imported transaction: OK")

        # 7. Confirm database ownership and account selection.
        with app.app_context():
            connection = db.session.get(
                BankConnection, connection_id
            )

            assert connection.status == "CONNECTED"

            accounts = BankAccount.query.filter_by(
                connection_id=connection_id,
                is_connected=True
            ).all()

            assert len(accounts) == 1
            assert accounts[0].external_account_id == approved_id

            transactions = Transaction.query.filter_by(
                user_id=owner_id
            ).all()

            assert len(transactions) == 1
            assert transactions[0].bank_account_id == accounts[0].id
            assert transactions[0].external_transaction_id == transaction_id

            print("Only selected account stored: OK")
            print("Transaction ownership verified: OK")

        # 8. Repeated confirmation must fail.
        response = owner_client.post(
            "/api/bank/oauth/confirm",
            json={
                "connection_id": connection_id,
                "account_ids": [approved_id]
            },
            headers={"X-CSRF-Token": owner_csrf}
        )

        print("Repeated confirmation:", response.status_code)
        assert response.status_code == 409

        # 9. Repeated sync must not duplicate transactions.
        with app.app_context():
            second_sync = sync_bank_connection(connection_id)

            assert second_sync["accounts_synced"] == 1
            assert second_sync["transactions_imported"] == 0

            print("Duplicate prevention: OK")

        # The sync service must never request the unselected account.
        for call in sync_bank.get_account_balance.call_args_list:
            assert call.args[1] == approved_id

        print("Unselected account never synced: OK")

        with app.app_context():
            assert BankAccount.query.count() == original_accounts + 1
            assert Transaction.query.count() == original_transactions + 1

        print("Existing financial data preserved: OK")
        print("\nALL BANK CONFIRMATION TESTS PASSED!")

finally:
    # Delete only records belonging to our temporary users.
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

            connection_ids = [item.id for item in connections]

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

        print("Temporary confirmation test data cleaned up.")
