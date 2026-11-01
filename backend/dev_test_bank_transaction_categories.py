
import secrets
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import (
    BankAccount,
    BankConnection,
    Transaction,
    User,
)


app = create_app()


def check(response, expected, description):
    actual = response.status_code

    assert actual == expected, (
        f"{description}: expected {expected}, got {actual}. "
        f"Response: {response.get_json()}"
    )

    print(f"PASS: {description} ({actual})")


def test_client(user_id=None):
    client = app.test_client()
    csrf_token = secrets.token_urlsafe(32)

    with client.session_transaction() as session:
        session["csrf_token"] = csrf_token

        if user_id is not None:
            session["user_id"] = user_id

    return client, {"X-CSRF-Token": csrf_token}


def run_tests():
    url = make_url(app.config["SQLALCHEMY_DATABASE_URI"])

    if (
        url.host not in ("localhost", "127.0.0.1")
        or url.database != "smartmoney_easy"
    ):
        raise RuntimeError(
            "Tests require the local smartmoney_easy database."
        )

    with app.app_context():
        suffix = uuid.uuid4().hex

        users = [
            User(email=f"bank-category-owner-{suffix}@example.test"),
            User(email=f"bank-category-other-{suffix}@example.test"),
        ]

        db.session.add_all(users)
        db.session.commit()

        user_ids = [user.id for user in users]

        try:
            connection = BankConnection(
                user_id=user_ids[0],
                provider="MOCK_BANK",
                external_customer_id=f"customer-{suffix}",
                status="CONNECTED",
            )

            db.session.add(connection)
            db.session.flush()

            account = BankAccount(
                connection_id=connection.id,
                external_account_id=f"account-{suffix}",
                account_name="Test Everyday Account",
                currency="NZD",
                balance=Decimal("950.00"),
                status="ACTIVE",
                is_connected=True,
            )

            db.session.add(account)
            db.session.flush()

            transaction = Transaction(
                user_id=user_ids[0],
                bank_account_id=account.id,
                external_transaction_id=f"transaction-{suffix}",
                source="BANK",
                description="PAKNSAVE",
                category=None,
                amount=Decimal("-50.00"),
                balance_after=Decimal("950.00"),
                currency="NZD",
                transaction_type="DEBIT",
                transaction_date=datetime.now(timezone.utc),
            )

            db.session.add(transaction)
            db.session.commit()

            transaction_id = transaction.id

            original_bank_data = (
                transaction.description,
                transaction.amount,
                transaction.balance_after,
                transaction.currency,
                transaction.transaction_type,
                transaction.transaction_date,
            )

            endpoint = (
                f"/api/bank/transactions/"
                f"{transaction_id}/category"
            )

            owner, headers = test_client(user_ids[0])
            other, other_headers = test_client(user_ids[1])
            anonymous, anonymous_headers = test_client()

            check(
                anonymous.patch(
                    endpoint,
                    json={"category": "Groceries"},
                    headers=anonymous_headers,
                ),
                401,
                "Unauthenticated category update blocked",
            )

            check(
                owner.patch(
                    endpoint,
                    json={"category": "Groceries"},
                ),
                403,
                "Missing CSRF token blocked",
            )

            check(
                other.patch(
                    endpoint,
                    json={"category": "Groceries"},
                    headers=other_headers,
                ),
                404,
                "Other user cannot edit bank transaction",
            )

            invalid_cases = [
                (
                    {"amount": "999.00"},
                    "Amount editing rejected",
                ),
                (
                    {
                        "category": "Groceries",
                        "amount": "999.00",
                    },
                    "Extra fields rejected",
                ),
                (
                    {"category": "Not a real category"},
                    "Unsupported category rejected",
                ),
                (
                    {"category": 123},
                    "Numeric category rejected",
                ),
                (
                    {"category": True},
                    "Boolean category rejected",
                ),
                (
                    {"category": []},
                    "Array category rejected",
                ),
                (
                    {},
                    "Empty update rejected",
                ),
            ]

            for payload, description in invalid_cases:
                check(
                    owner.patch(
                        endpoint,
                        json=payload,
                        headers=headers,
                    ),
                    400,
                    description,
                )

            response = owner.patch(
                endpoint,
                json={"category": "groceries"},
                headers=headers,
            )

            check(
                response,
                200,
                "Categorise bank transaction",
            )

            assert (
                response.get_json()["transaction"]["category"]
                == "Groceries"
            )

            db.session.expire_all()

            saved = db.session.get(Transaction, transaction_id)

            assert saved.category == "Groceries"

            assert (
                saved.description,
                saved.amount,
                saved.balance_after,
                saved.currency,
                saved.transaction_type,
                saved.transaction_date,
            ) == original_bank_data

            print("PASS: Category persisted in PostgreSQL")
            print("PASS: Original bank data preserved")

            response = owner.get("/api/bank/transactions")

            check(
                response,
                200,
                "Retrieve updated bank transaction history",
            )

            items = response.get_json()["transactions"]

            saved_item = next(
                item for item in items
                if item["id"] == transaction_id
            )

            assert saved_item["category"] == "Groceries"

            response = other.get("/api/bank/transactions")
            check(
                response,
                200,
                "Other user can retrieve own bank history",
            )

            assert all(
                item["id"] != transaction_id
                for item in response.get_json()["transactions"]
            )

            # Check category reset.
            response = owner.patch(
                endpoint,
                json={"category": None},
                headers=headers,
            )

            check(
                response,
                200,
                "Reset bank category",
            )

            assert (
                response.get_json()["transaction"]["category"]
                is None
            )

            # Keep category editing available after
            # disconnecting a Mock Bank connection.
            connection.status = "DISCONNECTED"
            account.is_connected = False
            db.session.commit()

            response = owner.patch(
                endpoint,
                json={"category": "Transport"},
                headers=headers,
            )

            check(
                response,
                200,
                "Categorise disconnected bank history",
            )

            db.session.expire_all()

            saved = db.session.get(Transaction, transaction_id)

            assert saved.category == "Transport"
            assert saved.amount == Decimal("-50.00")

            print("PASS: Disconnected history remains editable")

        finally:
            db.session.rollback()

            db.session.query(Transaction).filter(
                Transaction.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.session.query(BankAccount).filter(
                BankAccount.connection_id == connection.id
            ).delete(synchronize_session=False)

            db.session.query(BankConnection).filter(
                BankConnection.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.session.query(User).filter(
                User.id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.session.commit()

            print("Temporary test data cleaned up.")

    print("\nALL BANK CATEGORY API TESTS PASSED!")


if __name__ == "__main__":
    run_tests()
