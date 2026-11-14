import uuid
import secrets
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import (
    User,
    BankConnection,
    BankAccount,
    Transaction,
    CashWallet,
)


app = create_app()
app.config["TESTING"] = True


def authenticated_client(user_id):
    client = app.test_client()
    csrf = secrets.token_urlsafe(32)

    with client.session_transaction() as session:
        session["user_id"] = user_id
        session["csrf_token"] = csrf

    return client, {"X-CSRF-Token": csrf}


def verify(response, expected, description):
    assert response.status_code == expected, (
        f"{description}: expected {expected}, "
        f"got {response.status_code}: {response.get_json()}"
    )
    print(f"PASS: {description}")


def run_tests():
    url = make_url(app.config["SQLALCHEMY_DATABASE_URI"])

    if (
        url.host not in ("localhost", "127.0.0.1")
        or url.database not in (
            "smartmoney_easy_test",
            "smartmoney_pr13_test",
            "smartmoney_pr23_f65a0ac_test",
        )
    ):
        raise RuntimeError(
            "Tests require an approved local test database."
        )

    with app.app_context():

        # 1. Authentication and CSRF security tests.
        with app.test_client() as client:
            print("\nTesting unauthenticated DELETE with valid CSRF token...")

            response = client.get("/api/auth/csrf")
            verify(response, 200, "Obtain CSRF token")

            csrf_token = response.get_json()["csrf_token"]

            response = client.delete(
                "/api/bank/transactions/imported",
                headers={"X-CSRF-Token": csrf_token},
            )
            verify(
                response,
                401,
                "Unauthenticated DELETE request rejected",
            )

            print("\nTesting DELETE request without CSRF token...")

            response = client.delete(
                "/api/bank/transactions/imported"
            )
            verify(
                response,
                403,
                "DELETE request without CSRF token rejected",
            )

        # 2. Imported transaction deletion regression tests.
        suffix = uuid.uuid4().hex

        owner = User(
            email=f"delete-owner-{suffix}@example.test"
        )
        other = User(
            email=f"delete-other-{suffix}@example.test"
        )

        db.session.add_all([owner, other])
        db.session.flush()

        connection = BankConnection(
            user_id=owner.id,
            provider="MOCK_BANK",
            external_customer_id=f"customer-{suffix}",
            status="CONNECTED",
        )
        db.session.add(connection)
        db.session.flush()

        bank_account = BankAccount(
            connection_id=connection.id,
            external_account_id=f"account-{suffix}",
            account_name="Test Bank Account",
            currency="NZD",
            balance=Decimal("100.00"),
            status="ACTIVE",
            is_connected=True,
        )

        cash_wallet = CashWallet(
            user_id=owner.id,
            name="Test Cash Wallet",
            currency="NZD",
            opening_balance=Decimal("50.00"),
        )

        db.session.add_all([bank_account, cash_wallet])
        db.session.flush()

        bank_transaction = Transaction(
            user_id=owner.id,
            bank_account_id=bank_account.id,
            source="BANK",
            description="Imported bank transaction",
            amount=Decimal("-25.00"),
            currency="NZD",
            transaction_type="expense",
            transaction_date=datetime.now(timezone.utc),
        )

        other_bank_transaction = Transaction(
            user_id=other.id,
            bank_account_id=bank_account.id,
            source="BANK",
            description="Other user's bank transaction",
            amount=Decimal("-10.00"),
            currency="NZD",
            transaction_type="expense",
            transaction_date=datetime.now(timezone.utc),
        )

        cash_transaction = Transaction(
            user_id=owner.id,
            cash_wallet_id=cash_wallet.id,
            source="CASH",
            description="Cash transaction",
            amount=Decimal("-5.00"),
            currency="NZD",
            transaction_type="expense",
            transaction_date=datetime.now(timezone.utc),
        )

        db.session.add_all([
            bank_transaction,
            other_bank_transaction,
            cash_transaction,
        ])
        db.session.commit()

        owner_id = owner.id
        other_id = other.id
        connection_id = connection.id
        other_transaction_id = other_bank_transaction.id
        cash_transaction_id = cash_transaction.id
        bank_account_id = bank_account.id
        cash_wallet_id = cash_wallet.id
        bank_transaction_id = bank_transaction.id

        try:
            client, headers = authenticated_client(owner_id)

            # 3. Delete only the authenticated user's imported bank transactions.
            response = client.delete(
                "/api/bank/transactions/imported",
                headers=headers,
            )
            verify(
                response,
                200,
                "Delete imported bank transactions",
            )

            assert response.get_json()["deleted_count"] == 1

            db.session.expire_all()

            assert db.session.get(
                Transaction, bank_transaction_id
            ) is None

            assert db.session.get(
                Transaction, other_transaction_id
            ) is not None

            print("PASS: Other user's bank transaction preserved")

            # 4. Cash transactions and bank accounts must remain.
            assert db.session.get(
                Transaction, cash_transaction_id
            ) is not None

            assert db.session.get(
                BankAccount, bank_account_id
            ) is not None

            assert db.session.get(
                CashWallet, cash_wallet_id
            ) is not None

            print(
                "PASS: Cash transaction, wallet and bank account preserved"
            )

            # 5. Repeating the request must succeed with zero deletions.
            response = client.delete(
                "/api/bank/transactions/imported",
                headers=headers,
            )
            verify(
                response,
                200,
                "Repeat imported transaction deletion",
            )

            assert response.get_json()["deleted_count"] == 0

            print("PASS: Repeat deletion returns zero")

            # 6. A commit failure must trigger rollback.
            rollback_transaction = Transaction(
                user_id=owner_id,
                bank_account_id=bank_account_id,
                source="BANK",
                description="Rollback test transaction",
                amount=Decimal("-15.00"),
                currency="NZD",
                transaction_type="expense",
                transaction_date=datetime.now(timezone.utc),
            )

            db.session.add(rollback_transaction)
            db.session.commit()

            rollback_transaction_id = rollback_transaction.id

            with patch.object(
                db.session,
                "commit",
                side_effect=RuntimeError("Simulated commit failure"),
            ):
                response = client.delete(
                    "/api/bank/transactions/imported",
                    headers=headers,
                )

            verify(
                response,
                500,
                "Commit failure returns server error",
            )

            db.session.expire_all()

            assert db.session.get(
                Transaction, rollback_transaction_id
            ) is not None

            print("PASS: Failed deletion rolled back")

            print("\nALL IMPORTED TRANSACTION DELETE TESTS PASSED!")

        finally:
            db.session.rollback()

            db.session.query(Transaction).filter(
                Transaction.user_id.in_([owner_id, other_id])
            ).delete(synchronize_session=False)

            db.session.query(BankAccount).filter_by(
                id=bank_account_id
            ).delete(synchronize_session=False)

            db.session.query(CashWallet).filter_by(
                id=cash_wallet_id
            ).delete(synchronize_session=False)

            db.session.query(BankConnection).filter_by(
                id=connection_id
            ).delete(synchronize_session=False)

            db.session.delete(owner)
            db.session.delete(other)
            db.session.commit()

            print("Temporary test data cleaned up.")


if __name__ == "__main__":
    run_tests()
