
import secrets
import uuid

from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import User, Transaction

from datetime import datetime, timezone
from decimal import Decimal


app = create_app()


def verify(response, expected, description):
    actual = response.status_code

    if actual != expected:
        raise AssertionError(
            f"{description}: expected {expected}, "
            f"received {actual}. Response: {response.get_json()}"
        )

    print(f"PASS: {description} ({actual})")


def authenticated_client(user_id):
    client = app.test_client()
    csrf_token = secrets.token_urlsafe(32)

    with client.session_transaction() as session:
        session["user_id"] = user_id
        session["csrf_token"] = csrf_token

    return client, {"X-CSRF-Token": csrf_token}


def run_tests():
    # Prevent database-writing tests on hosted databases.
    database_url = make_url(
        app.config["SQLALCHEMY_DATABASE_URI"]
    )

    if (
        database_url.host not in ("localhost", "127.0.0.1")
        or database_url.database != "smartmoney_easy"
    ):
        raise RuntimeError(
            "Tests require the local smartmoney_easy database."
        )

    with app.app_context():
        suffix = uuid.uuid4().hex

        user_one = User(
            email=f"wallet-owner-{suffix}@example.test"
        )

        user_two = User(
            email=f"wallet-other-{suffix}@example.test"
        )

        db.session.add_all([user_one, user_two])
        db.session.commit()

        user_ids = [user_one.id, user_two.id]

        try:
            owner, owner_headers = authenticated_client(
                user_ids[0]
            )

            other, other_headers = authenticated_client(
                user_ids[1]
            )

            anonymous = app.test_client()

            verify(
                anonymous.get("/api/cash-wallets"),
                401,
                "Unauthenticated access blocked",
            )

            response = owner.get("/api/cash-wallets")
            verify(response, 200, "Retrieve empty wallet list")
            assert response.get_json()["count"] == 0

            payload = {
                "name": "Personal Cash",
                "currency": "NZD",
                "openingBalance": "150.00",
            }

            verify(
                owner.post(
                    "/api/cash-wallets",
                    json=payload,
                ),
                403,
                "Missing CSRF token blocked",
            )

            response = owner.post(
                "/api/cash-wallets",
                json=payload,
                headers=owner_headers,
            )

            verify(response, 201, "Create cash wallet")

            wallet = response.get_json()["wallet"]
            wallet_id = wallet["id"]

            assert wallet["name"] == "Personal Cash"
            assert wallet["currency"] == "NZD"
            assert wallet["openingBalance"] == "150.00"
            assert wallet["currentBalance"] == "150.00"
            print("PASS: New wallet balance matches opening balance")
            assert wallet["isArchived"] is False

            response = owner.get("/api/cash-wallets")
            verify(response, 200, "Retrieve created wallet")

            assert response.get_json()["count"] == 1
            assert response.get_json()["wallets"][0]["id"] == wallet_id
            assert response.headers["Cache-Control"] == "no-store"

            verify(
                owner.post(
                    "/api/cash-wallets",
                    json=payload,
                    headers=owner_headers,
                ),
                409,
                "Duplicate wallet rejected",
            )

            invalid_cases = [
                (
                    {"openingBalance": "-10.00"},
                    "Negative balance rejected",
                ),
                (
                    {"openingBalance": "12.345"},
                    "More than two decimals rejected",
                ),
                (
                    {"openingBalance": "NaN"},
                    "Non-finite amount rejected",
                ),
                (
                    {"openingBalance": True},
                    "Boolean amount rejected",
                ),
                (
                    {"currency": "USD"},
                    "Unsupported currency rejected",
                ),
                (
                    {"name": ""},
                    "Empty wallet name rejected",
                ),
                (
                    {"unexpected": "value"},
                    "Unexpected field rejected",
                ),
            ]

            for changes, description in invalid_cases:
                verify(
                    owner.post(
                        "/api/cash-wallets",
                        json={**payload, **changes},
                        headers=owner_headers,
                    ),
                    400,
                    description,
                )

            response = other.get("/api/cash-wallets")

            verify(
                response,
                200,
                "Second user retrieves own wallets",
            )

            assert response.get_json()["count"] == 0

            response = other.post(
                "/api/cash-wallets",
                json=payload,
                headers=other_headers,
            )

            verify(
                response,
                201,
                "Second user can create same wallet name",
            )

            assert response.get_json()["wallet"]["id"] != wallet_id

            response = owner.get("/api/cash-wallets")
            assert response.get_json()["count"] == 1
            assert response.get_json()["wallets"][0]["id"] == wallet_id
            # Test updating wallet details.
            verify(
                owner.patch(
                    f"/api/cash-wallets/{wallet_id}",
                    json={"name": "Updated Cash"},
                ),
                403,
                "Edit without CSRF token blocked",
            )

            response = owner.patch(
                f"/api/cash-wallets/{wallet_id}",
                json={
                    "name": "Emergency Cash",
                    "openingBalance": "175.25",
                },
                headers=owner_headers,
            )

            verify(
                response,
                200,
                "Update wallet name and opening balance",
            )

            updated = response.get_json()["wallet"]

            assert updated["name"] == "Emergency Cash"
            assert updated["openingBalance"] == "175.25"
            assert updated["id"] == wallet_id

            verify(
                owner.patch(
                    f"/api/cash-wallets/{wallet_id}",
                    json={"name": ""},
                    headers=owner_headers,
                ),
                400,
                "Empty wallet name rejected on edit",
            )

            verify(
                owner.patch(
                    f"/api/cash-wallets/{wallet_id}",
                    json={"openingBalance": "-5.00"},
                    headers=owner_headers,
                ),
                400,
                "Negative opening balance rejected on edit",
            )

            verify(
                owner.patch(
                    f"/api/cash-wallets/{wallet_id}",
                    json={"currency": "USD"},
                    headers=owner_headers,
                ),
                400,
                "Unsupported edit field rejected",
            )

            verify(
                other.patch(
                    f"/api/cash-wallets/{wallet_id}",
                    json={"name": "Unauthorized Edit"},
                    headers=other_headers,
                ),
                404,
                "Other user cannot edit wallet",
            )

            response = owner.post(
                "/api/cash-wallets",
                json={
                    "name": "Spare Cash",
                    "currency": "NZD",
                    "openingBalance": "50.00",
                },
                headers=owner_headers,
            )

            verify(
                response,
                201,
                "Create second wallet for duplicate-name test",
            )

            verify(
                owner.patch(
                    f"/api/cash-wallets/{wallet_id}",
                    json={"name": "Spare Cash"},
                    headers=owner_headers,
                ),
                409,
                "Duplicate wallet name rejected on edit",
            )

            response = owner.get("/api/cash-wallets")

            verify(
                response,
                200,
                "Retrieve wallets after editing",
            )

            assert response.get_json()["count"] == 2

            saved_wallet = next(
                wallet
                for wallet in response.get_json()["wallets"]
                if wallet["id"] == wallet_id
            )

            assert saved_wallet["name"] == "Emergency Cash"
            assert saved_wallet["openingBalance"] == "175.25"

            print("ALL CASH WALLET EDIT TESTS PASSED!")


            # Add a temporary cash transaction to the wallet.
            transaction = Transaction(
                user_id=user_ids[0],
                cash_wallet_id=wallet_id,
                source="CASH",
                description="Cash wallet balance protection test",
                amount=Decimal("-10.00"),
                currency="NZD",
                transaction_type="expense",
                transaction_date=datetime.now(timezone.utc),
            )

            db.session.add(transaction)
            db.session.commit()

            print("PASS: Cash transaction saved to PostgreSQL")


            response = owner.get("/api/cash-wallets")

            verify(
                response,
                200,
                "Retrieve wallet balance after cash transaction",
            )

            updated_wallet = next(
                wallet
                for wallet in response.get_json()["wallets"]
                if wallet["id"] == wallet_id
            )

            assert updated_wallet["openingBalance"] == "175.25"
            assert updated_wallet["currentBalance"] == "165.25"

            print(
                "PASS: Cash expense deducted from wallet balance"
            )


            # Opening balance changes must now be blocked.
            response = owner.patch(
                f"/api/cash-wallets/{wallet_id}",
                json={"openingBalance": "200.00"},
                headers=owner_headers,
            )

            verify(
                response,
                409,
                "Opening balance change blocked after transaction",
            )

            # Renaming the wallet must still work.
            response = owner.patch(
                f"/api/cash-wallets/{wallet_id}",
                json={"name": "Protected Cash Wallet"},
                headers=owner_headers,
            )

            verify(
                response,
                200,
                "Wallet rename allowed after transaction",
            )

            assert (
                response.get_json()["wallet"]["openingBalance"]
                == "175.25"
            )

            print("ALL CASH WALLET BALANCE PROTECTION TESTS PASSED!")


            # Test Cash Wallet archiving.

            verify(
                owner.patch(
                    f"/api/cash-wallets/{wallet_id}/archive",
                ),
                403,
                "Archive without CSRF token blocked",
            )

            verify(
                other.patch(
                    f"/api/cash-wallets/{wallet_id}/archive",
                    headers=other_headers,
                ),
                404,
                "Other user cannot archive wallet",
            )

            response = owner.patch(
                f"/api/cash-wallets/{wallet_id}/archive",
                headers=owner_headers,
            )

            verify(
                response,
                200,
                "Archive cash wallet",
            )

            assert response.get_json()["wallet"]["isArchived"] is True

            # An archived wallet should disappear from the active list.
            response = owner.get("/api/cash-wallets")

            verify(
                response,
                200,
                "Retrieve active wallets after archiving",
            )

            assert response.get_json()["count"] == 1

            assert all(
                wallet["id"] != wallet_id
                for wallet in response.get_json()["wallets"]
            )

            print("PASS: Archived wallet hidden from active list")

            # Verify the existing cash transaction is still saved.
            db.session.expire_all()

            saved_transaction = db.session.get(
                Transaction,
                transaction.id,
            )

            assert saved_transaction is not None
            assert saved_transaction.cash_wallet_id == wallet_id
            assert saved_transaction.amount == Decimal("-10.00")

            print("PASS: Cash transaction history preserved")

            # Repeating the operation should be safe.
            response = owner.patch(
                f"/api/cash-wallets/{wallet_id}/archive",
                headers=owner_headers,
            )

            verify(
                response,
                200,
                "Archiving an already archived wallet",
            )

            assert response.get_json()["wallet"]["isArchived"] is True

            # Archived wallets must no longer be editable.
            verify(
                owner.patch(
                    f"/api/cash-wallets/{wallet_id}",
                    json={"name": "Should Not Change"},
                    headers=owner_headers,
                ),
                404,
                "Editing archived wallet blocked",
            )

            print("ALL CASH WALLET ARCHIVE TESTS PASSED!")



        finally:
            db.session.rollback()

            # Remove temporary transactions before deleting users.
            # Their cash wallets have restrictive foreign keys.
            db.session.query(Transaction).filter(
                Transaction.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            # Delete only temporary users created by this test.
            # Their wallets cascade-delete in PostgreSQL.
            for user_id in user_ids:
                user = db.session.get(User, user_id)

                if user is not None:
                    db.session.delete(user)

            db.session.commit()
            print("Temporary test data cleaned up.")


if __name__ == "__main__":
    run_tests()
