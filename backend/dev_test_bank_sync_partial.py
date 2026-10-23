
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from app import create_app
from app.extensions import db
from app.models import User, BankConnection, BankAccount, Transaction
from app.services.bank_crypto import encrypt_secret
from app.services.mock_bank import MockBankError
from app.services.bank_sync import sync_bank_connection


app = create_app()
app.config["TESTING"] = True

test_email = f"partial-sync-{uuid4().hex}@example.test"
test_token = f"test-token-{uuid4().hex}"

good_external_id = str(uuid4())
failed_external_id = str(uuid4())
transaction_id = str(uuid4())


try:
    with app.app_context():
        # Create an isolated test user and connection.
        user = User(email=test_email)
        user.set_password("SmartMoneyPartialTest!2026")

        db.session.add(user)
        db.session.flush()

        connection = BankConnection(
            user_id=user.id,
            provider="MOCK_BANK",
            external_customer_id=str(uuid4()),
            status="CONNECTED",
            access_token_encrypted=encrypt_secret(test_token),
            access_token_expires_at=(
                datetime.now(timezone.utc) + timedelta(days=1)
            ),
        )

        db.session.add(connection)
        db.session.flush()

        good_account = BankAccount(
            connection_id=connection.id,
            external_account_id=good_external_id,
            account_name="Working Account",
            account_type="EVERYDAY",
            currency="NZD",
            balance=Decimal("500.00"),
            status="ACTIVE",
            is_connected=True,
        )

        failed_account = BankAccount(
            connection_id=connection.id,
            external_account_id=failed_external_id,
            account_name="Failing Account",
            account_type="SAVINGS",
            currency="NZD",
            balance=Decimal("200.00"),
            status="ACTIVE",
            is_connected=True,
        )

        db.session.add_all([good_account, failed_account])
        db.session.commit()

        connection_id = connection.id
        good_id = good_account.id
        failed_id = failed_account.id

        print("Two test bank accounts created: OK")

        def mock_balance(token, account_id):
            assert token == test_token

            if account_id == good_external_id:
                return {
                    "account_id": good_external_id,
                    "balance": "800.00",
                    "currency": "NZD",
                    "status": "ACTIVE",
                }

            if account_id == failed_external_id:
                return {
                    "account_id": failed_external_id,
                    "balance": "999.00",
                    "currency": "NZD",
                    "status": "ACTIVE",
                }

            raise AssertionError("Unexpected account ID")

        def mock_transactions(token, account_id):
            assert token == test_token

            if account_id == failed_external_id:
                raise MockBankError(
                    "Simulated temporary account failure.",
                    status_code=503,
                )

            if account_id == good_external_id:
                return {
                    "account_id": good_external_id,
                    "transactions": [
                        {
                            "id": transaction_id,
                            "description": "Test Grocery Purchase",
                            "amount": "-50.00",
                            "balance_after": "800.00",
                            "currency": "NZD",
                            "transaction_type": "DEBIT",
                            "transaction_date": (
                                "2026-10-20T11:00:00+00:00"
                            ),
                        }
                    ],
                }

            raise AssertionError("Unexpected account ID")

        with patch(
            "app.services.bank_sync.MockBankAuthorizedClient"
        ) as client_class:
            bank = client_class.return_value
            bank.get_account_balance.side_effect = mock_balance
            bank.get_account_transactions.side_effect = mock_transactions

            result = sync_bank_connection(connection_id)

            assert bank.get_account_balance.call_count == 2
            assert bank.get_account_transactions.call_count == 2

        print("Sync result:", result)

        assert result["status"] == "partial_success", result
        assert result["accounts_synced"] == 1
        assert result["accounts_failed"] == 1
        assert result["transactions_imported"] == 1
        assert failed_id in result["failed_account_ids"]

        print("Partial sync response: OK")

        # Verify data was actually committed to PostgreSQL.
        db.session.expire_all()

        saved_good = db.session.get(BankAccount, good_id)
        saved_failed = db.session.get(BankAccount, failed_id)

        assert saved_good.balance == Decimal("800.00")
        assert saved_failed.balance == Decimal("200.00")

        print("Successful account balance persisted: OK")
        print("Failed account balance preserved: OK")

        good_transactions = Transaction.query.filter_by(
            bank_account_id=good_id
        ).all()

        failed_transactions = Transaction.query.filter_by(
            bank_account_id=failed_id
        ).all()

        assert len(good_transactions) == 1
        assert good_transactions[0].external_transaction_id == transaction_id
        assert len(failed_transactions) == 0

        print("Successful account transaction persisted: OK")
        print("Failed account has no imported transactions: OK")

        saved_connection = db.session.get(
            BankConnection, connection_id
        )

        assert saved_connection.last_synced_at is not None

        print("Last synchronisation timestamp updated: OK")
        print("\nALL PARTIAL BANK SYNC TESTS PASSED!")

finally:
    # Clean up only this test user's data.
    with app.app_context():
        db.session.rollback()

        user = User.query.filter_by(email=test_email).first()

        if user is not None:
            connections = BankConnection.query.filter_by(
                user_id=user.id
            ).all()

            Transaction.query.filter_by(
                user_id=user.id
            ).delete(synchronize_session=False)

            for connection in connections:
                BankAccount.query.filter_by(
                    connection_id=connection.id
                ).delete(synchronize_session=False)

                db.session.delete(connection)

            db.session.delete(user)
            db.session.commit()

            print("Temporary test data cleaned up.")
