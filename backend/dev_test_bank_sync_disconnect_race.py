
from datetime import datetime, timedelta, timezone
from threading import Event, Thread
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
from app.services.bank_sync import (
    sync_bank_connection,
    BankReauthorizationRequired,
)


app = create_app()
app.config["TESTING"] = True

test_email = f"sync-race-{uuid4().hex}@example.test"
password = "SmartMoneyRaceTest!2026"

customer_id = str(uuid4())
account_id = str(uuid4())
transaction_id = str(uuid4())
test_token = f"temporary-token-{uuid4().hex}"

sync_paused = Event()
allow_sync_to_continue = Event()

worker = None
worker_results = []
worker_errors = []


def register(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200

    csrf = response.get_json()["csrf_token"]

    response = client.post(
        "/api/auth/register",
        json={
            "email": test_email,
            "password": password,
        },
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 201, response.get_json()

    data = response.get_json()
    return data["user"]["id"], data["csrf_token"]


try:
    with app.app_context():
        original_account_count = BankAccount.query.count()
        original_transaction_count = Transaction.query.count()

    client = app.test_client()
    user_id, csrf = register(client)

    print("SmartMoney authentication: OK")

    # Create a temporary pending connection.
    with app.app_context():
        connection = BankConnection(
            user_id=user_id,
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
                    "account_name": "Race Test Account",
                    "account_number": "1234560001",
                    "account_type": "EVERYDAY",
                    "currency": "NZD",
                    "balance": "500.00",
                    "status": "ACTIVE",
                }
            ],
        }

        sync_bank.get_account_balance.return_value = {
            "account_id": account_id,
            "currency": "NZD",
            "balance": "500.00",
            "status": "ACTIVE",
        }

        # Initial confirmation imports no transactions.
        sync_bank.get_account_transactions.return_value = {
            "account_id": account_id,
            "currency": "NZD",
            "status": "ACTIVE",
            "transactions": [],
        }

        # Confirm the bank connection.
        response = client.post(
            "/api/bank/oauth/confirm",
            json={
                "connection_id": connection_id,
                "account_ids": [account_id],
            },
            headers={"X-CSRF-Token": csrf},
        )

        assert response.status_code == 200, response.get_json()
        assert response.get_json()["sync_status"] == "SUCCESS"

        print("Bank connected: OK")

        # Make the next bank request pause until
        # the test allows it to continue.
        def paused_transactions(*args, **kwargs):
            sync_paused.set()

            if not allow_sync_to_continue.wait(timeout=20):
                raise TimeoutError(
                    "Concurrent sync test timed out."
                )

            return {
                "account_id": account_id,
                "currency": "NZD",
                "status": "ACTIVE",
                "transactions": [
                    {
                        "id": transaction_id,
                        "transaction_date":
                            "2026-10-18T09:00:00+00:00",
                        "description": "Concurrent Test Purchase",
                        "amount": "-25.00",
                        "balance_after": "475.00",
                        "transaction_type": "DEBIT",
                    }
                ],
            }

        sync_bank.get_account_transactions.side_effect = (
            paused_transactions
        )

        # Run synchronisation in a separate thread.
        def run_sync():
            with app.app_context():
                try:
                    sync_bank_connection(connection_id)
                    worker_results.append("COMMITTED")

                except BankReauthorizationRequired:
                    worker_results.append("BLOCKED")

                except Exception as exc:
                    worker_errors.append(repr(exc))

        worker = Thread(
            target=run_sync,
            daemon=True,
        )

        worker.start()

        assert sync_paused.wait(timeout=10), (
            "Synchronisation did not reach Mock Bank."
        )

        print("Synchronisation paused: OK")

        # Disconnect while synchronisation is paused.
        disconnect_url = (
            f"/api/bank/connections/"
            f"{connection_id}/disconnect"
        )

        try:
            response = client.post(
                disconnect_url,
                headers={"X-CSRF-Token": csrf},
            )

            print(
                "Disconnect during sync:",
                response.status_code,
            )

            assert response.status_code == 200, (
                response.get_json()
            )

            assert response.get_json()["status"] == (
                "DISCONNECTED"
            )

            print("Bank disconnected: OK")

        finally:
            # Always unblock the worker.
            allow_sync_to_continue.set()

        worker.join(timeout=20)

        assert not worker.is_alive(), (
            "Synchronisation worker did not finish."
        )

        assert not worker_errors, worker_errors

        # The expected result is a rollback.
        assert worker_results == ["BLOCKED"], (
            f"Unexpected sync result: {worker_results}"
        )

        print("Concurrent synchronisation rejected: OK")

        disconnect_bank.revoke_access.assert_called_once_with(
            test_token
        )

        # Verify PostgreSQL did not save the new transaction.
        with app.app_context():
            connection = db.session.get(
                BankConnection,
                connection_id,
            )

            assert connection.status == "DISCONNECTED"
            assert connection.access_token_encrypted is None

            account = BankAccount.query.filter_by(
                connection_id=connection_id,
            ).one()

            assert account.is_connected is False

            transactions = Transaction.query.filter_by(
                user_id=user_id,
            ).all()

            assert len(transactions) == 0

            assert (
                BankAccount.query.count()
                == original_account_count + 1
            )

            assert (
                Transaction.query.count()
                == original_transaction_count
            )

        print("No transactions committed after disconnect: OK")
        print("Bank account disabled: OK")
        print("Existing financial data preserved: OK")

        print("\nALL BANK CONCURRENCY TESTS PASSED!")

finally:
    allow_sync_to_continue.set()

    if worker is not None and worker.is_alive():
        worker.join(timeout=20)

    if worker is not None and worker.is_alive():
        print(
            "Worker still active; temporary records "
            "were not removed to avoid interfering with it."
        )

    else:
        # Remove only temporary records created by this test.
        with app.app_context():
            db.session.rollback()

            user = User.query.filter_by(
                email=test_email,
            ).first()

            if user is not None:
                Transaction.query.filter_by(
                    user_id=user.id
                ).delete(synchronize_session=False)

                BankOAuthAttempt.query.filter_by(
                    user_id=user.id
                ).delete(synchronize_session=False)

                connections = BankConnection.query.filter_by(
                    user_id=user.id
                ).all()

                for connection in connections:
                    BankAccount.query.filter_by(
                        connection_id=connection.id
                    ).delete(synchronize_session=False)

                    db.session.delete(connection)

                db.session.delete(user)
                db.session.commit()

                print("Temporary concurrency test data cleaned up.")
