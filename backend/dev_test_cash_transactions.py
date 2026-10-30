
import secrets
import uuid
from decimal import Decimal

from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import User, Transaction


app = create_app()


def verify(response, expected, description):
    actual = response.status_code

    if actual != expected:
        raise AssertionError(
            f"{description}: expected {expected}, got {actual}. "
            f"Response: {response.get_json()}"
        )

    print(f"PASS: {description} ({actual})")


def authenticated_client(user_id):
    client = app.test_client()
    csrf = secrets.token_urlsafe(32)

    with client.session_transaction() as session:
        session["user_id"] = user_id
        session["csrf_token"] = csrf

    return client, {"X-CSRF-Token": csrf}


def run_tests():
    # Never run database-writing tests on hosted databases.
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
            User(email=f"cash-tx-owner-{suffix}@example.test"),
            User(email=f"cash-tx-other-{suffix}@example.test"),
        ]

        db.session.add_all(users)
        db.session.commit()

        user_ids = [user.id for user in users]

        try:
            owner, owner_headers = authenticated_client(
                user_ids[0]
            )
            other, other_headers = authenticated_client(
                user_ids[1]
            )
            anonymous = app.test_client()

            verify(
                anonymous.get("/api/cash-transactions"),
                401,
                "Unauthenticated transaction access blocked",
            )

            response = owner.get("/api/cash-transactions")
            verify(response, 200, "Retrieve empty transaction list")
            assert response.get_json()["count"] == 0

            # Create one test wallet for each user.
            wallet_payload = {
                "name": "Test Cash",
                "currency": "NZD",
                "openingBalance": "100.00",
            }

            response = owner.post(
                "/api/cash-wallets",
                json=wallet_payload,
                headers=owner_headers,
            )
            verify(response, 201, "Create owner's wallet")
            wallet_id = response.get_json()["wallet"]["id"]

            response = other.post(
                "/api/cash-wallets",
                json=wallet_payload,
                headers=other_headers,
            )
            verify(response, 201, "Create second user's wallet")

            payload = {
                "assetId": wallet_id,
                "type": "income",
                "amount": "50.00",
                "category": "Gift",
                "date": "2026-10-23",
                "note": "Birthday gift",
            }

            verify(
                owner.post(
                    "/api/cash-transactions",
                    json=payload,
                ),
                403,
                "Creating without CSRF blocked",
            )

            verify(
                other.post(
                    "/api/cash-transactions",
                    json=payload,
                    headers=other_headers,
                ),
                404,
                "Other user cannot use owner's wallet",
            )

            invalid_cases = [
                ({"amount": "-10"}, "Negative amount rejected"),
                ({"amount": "0"}, "Zero amount rejected"),
                ({"amount": "1.001"}, "Excess decimals rejected"),
                ({"amount": "NaN"}, "Non-finite amount rejected"),
                ({"amount": True}, "Boolean amount rejected"),
                ({"type": "transfer"}, "Invalid type rejected"),
                ({"category": ""}, "Empty category rejected"),
                ({"note": "x" * 251}, "Long note rejected"),
                ({"date": "2026-02-30"}, "Invalid date rejected"),
                (
                    {"unexpected": "value"},
                    "Unexpected field rejected",
                ),
            ]

            for changes, description in invalid_cases:
                verify(
                    owner.post(
                        "/api/cash-transactions",
                        json={**payload, **changes},
                        headers=owner_headers,
                    ),
                    400,
                    description,
                )

            # Income increases the cash balance.
            response = owner.post(
                "/api/cash-transactions",
                json=payload,
                headers=owner_headers,
            )
            verify(response, 201, "Create cash income")

            income = response.get_json()["transaction"]
            assert income["type"] == "income"
            assert income["amount"] == "50.00"
            assert income["category"] == "Gift"
            assert income["note"] == "Birthday gift"
            assert income["assetId"] == wallet_id

            # Expense decreases the cash balance.
            expense_payload = {
                **payload,
                "type": "expense",
                "amount": "20.00",
                "category": "Groceries",
                "note": "Food shopping",
            }

            response = owner.post(
                "/api/cash-transactions",
                json=expense_payload,
                headers=owner_headers,
            )
            verify(response, 201, "Create cash expense")

            expense = response.get_json()["transaction"]
            assert expense["type"] == "expense"
            assert expense["amount"] == "20.00"

            response = owner.get("/api/cash-transactions")
            verify(response, 200, "Retrieve cash transaction history")

            history = response.get_json()
            assert history["count"] == 2
            assert response.headers["Cache-Control"] == "no-store"

            response = other.get("/api/cash-transactions")
            verify(response, 200, "Second user retrieves own history")
            assert response.get_json()["count"] == 0

            # Check the actual signed amounts in PostgreSQL.
            saved_income = db.session.get(
                Transaction, income["id"]
            )
            saved_expense = db.session.get(
                Transaction, expense["id"]
            )

            assert saved_income.amount == Decimal("50.00")
            assert saved_expense.amount == Decimal("-20.00")

            for transaction in (saved_income, saved_expense):
                assert transaction.source == "CASH"
                assert transaction.user_id == user_ids[0]
                assert transaction.cash_wallet_id == wallet_id
                assert transaction.bank_account_id is None

            print("PASS: Signed transaction amounts stored correctly")
            print("PASS: Cash transactions kept separate from bank data")

            # 100 opening + 50 income - 20 expense = 130.
            response = owner.get("/api/cash-wallets")
            verify(response, 200, "Retrieve updated wallet balance")

            wallet = next(
                item
                for item in response.get_json()["wallets"]
                if item["id"] == wallet_id
            )

            assert wallet["openingBalance"] == "100.00"
            assert wallet["currentBalance"] == "130.00"

            print("PASS: Wallet current balance is NZD 130.00")


            # Test editing existing cash transactions.

            verify(
                owner.patch(
                    f"/api/cash-transactions/{expense['id']}",
                    json={"amount": "40.00"},
                ),
                403,
                "Editing transaction without CSRF blocked",
            )

            verify(
                other.patch(
                    f"/api/cash-transactions/{expense['id']}",
                    json={"amount": "999.00"},
                    headers=other_headers,
                ),
                404,
                "Other user cannot edit transaction",
            )

            verify(
                owner.patch(
                    f"/api/cash-transactions/{expense['id']}",
                    json={"amount": "-10.00"},
                    headers=owner_headers,
                ),
                400,
                "Negative amount rejected on edit",
            )

            # Change an expense from NZD 20 to NZD 40.
            response = owner.patch(
                f"/api/cash-transactions/{expense['id']}",
                json={"amount": "40.00"},
                headers=owner_headers,
            )

            verify(
                response,
                200,
                "Update cash expense amount",
            )

            assert response.get_json()["transaction"]["amount"] == "40.00"

            # 100 opening + 50 income - 40 expense = 110.
            response = owner.get("/api/cash-wallets")
            verify(response, 200, "Check balance after expense edit")

            updated_wallet = next(
                item for item in response.get_json()["wallets"]
                if item["id"] == wallet_id
            )

            assert updated_wallet["currentBalance"] == "110.00"
            print("PASS: Edited expense recalculated balance to 110.00")

            # Change the expense into income.
            response = owner.patch(
                f"/api/cash-transactions/{expense['id']}",
                json={
                    "type": "income",
                    "category": "Refund",
                    "date": "2026-10-22",
                    "note": "Returned purchase",
                },
                headers=owner_headers,
            )

            verify(
                response,
                200,
                "Change cash expense into income",
            )

            updated = response.get_json()["transaction"]

            assert updated["type"] == "income"
            assert updated["category"] == "Refund"
            assert updated["date"] == "2026-10-22"
            assert updated["note"] == "Returned purchase"

            # 100 opening + 50 income + 40 income = 190.
            response = owner.get("/api/cash-wallets")

            updated_wallet = next(
                item for item in response.get_json()["wallets"]
                if item["id"] == wallet_id
            )

            assert updated_wallet["currentBalance"] == "190.00"
            print("PASS: Type change recalculated balance to 190.00")

            # Create another wallet for the same user.
            response = owner.post(
                "/api/cash-wallets",
                json={
                    "name": "Secondary Cash",
                    "currency": "NZD",
                    "openingBalance": "25.00",
                },
                headers=owner_headers,
            )

            verify(response, 201, "Create destination cash wallet")

            second_wallet_id = response.get_json()["wallet"]["id"]

            # Move the NZD 40 income to the second wallet.
            response = owner.patch(
                f"/api/cash-transactions/{expense['id']}",
                json={"assetId": second_wallet_id},
                headers=owner_headers,
            )

            verify(
                response,
                200,
                "Move transaction to another wallet",
            )

            assert (
                response.get_json()["transaction"]["assetId"]
                == second_wallet_id
            )

            response = owner.get("/api/cash-wallets")
            verify(response, 200, "Check both wallet balances")

            balances = {
                item["id"]: item["currentBalance"]
                for item in response.get_json()["wallets"]
            }

            # Original wallet: 100 + 50 = 150.
            assert balances[wallet_id] == "150.00"

            # Destination wallet: 25 + 40 = 65.
            assert balances[second_wallet_id] == "65.00"

            print("PASS: Original wallet balance updated to 150.00")
            print("PASS: Destination wallet balance updated to 65.00")

            # Check the saved PostgreSQL record.
            db.session.expire_all()

            saved_transaction = db.session.get(
                Transaction,
                expense["id"],
            )

            assert saved_transaction.cash_wallet_id == second_wallet_id
            assert saved_transaction.amount == Decimal("40.00")
            assert saved_transaction.bank_account_id is None

            print("PASS: Transaction changes persisted in PostgreSQL")
            print("ALL CASH TRANSACTION EDIT TESTS PASSED!")


            # Test deleting a cash transaction.
            # Use a temporary expense so existing history remains intact.

            delete_payload = {
                "assetId": second_wallet_id,
                "type": "expense",
                "amount": "10.00",
                "category": "Transport",
                "date": "2026-10-23",
                "note": "Temporary deletion test",
            }

            response = owner.post(
                "/api/cash-transactions",
                json=delete_payload,
                headers=owner_headers,
            )

            verify(
                response,
                201,
                "Create temporary expense for deletion",
            )

            delete_id = response.get_json()["transaction"]["id"]

            # Secondary wallet: 25 + 40 - 10 = 55.
            response = owner.get("/api/cash-wallets")

            balances = {
                item["id"]: item["currentBalance"]
                for item in response.get_json()["wallets"]
            }

            assert balances[second_wallet_id] == "55.00"
            assert balances[wallet_id] == "150.00"

            print("PASS: Expense reduced secondary wallet to 55.00")

            verify(
                owner.delete(
                    f"/api/cash-transactions/{delete_id}",
                ),
                403,
                "Deleting without CSRF blocked",
            )

            verify(
                other.delete(
                    f"/api/cash-transactions/{delete_id}",
                    headers=other_headers,
                ),
                404,
                "Other user cannot delete transaction",
            )

            response = owner.delete(
                f"/api/cash-transactions/{delete_id}",
                headers=owner_headers,
            )

            verify(
                response,
                200,
                "Delete cash transaction",
            )

            # Deleted transaction should no longer exist.
            db.session.expire_all()

            assert db.session.get(Transaction, delete_id) is None

            print("PASS: Transaction removed from PostgreSQL")

            verify(
                owner.delete(
                    f"/api/cash-transactions/{delete_id}",
                    headers=owner_headers,
                ),
                404,
                "Deleting an already deleted transaction",
            )

            # Secondary wallet should recover its previous balance.
            response = owner.get("/api/cash-wallets")

            verify(
                response,
                200,
                "Retrieve balances after deletion",
            )

            balances = {
                item["id"]: item["currentBalance"]
                for item in response.get_json()["wallets"]
            }

            assert balances[second_wallet_id] == "65.00"
            assert balances[wallet_id] == "150.00"

            print("PASS: Secondary wallet recalculated to 65.00")
            print("PASS: Original wallet remains at 150.00")

            response = owner.get("/api/cash-transactions")

            verify(
                response,
                200,
                "Retrieve history after deletion",
            )

            assert response.get_json()["count"] == 2

            print("PASS: Other transaction history preserved")
            print("ALL CASH TRANSACTION DELETE TESTS PASSED!")


            # Archive the wallet without deleting its history.
            verify(
                owner.patch(
                    f"/api/cash-wallets/{wallet_id}/archive",
                    headers=owner_headers,
                ),
                200,
                "Archive wallet with recorded transactions",
            )

            verify(
                owner.post(
                    "/api/cash-transactions",
                    json=payload,
                    headers=owner_headers,
                ),
                404,
                "Cannot create transaction in archived wallet",
            )

            response = owner.get("/api/cash-transactions")
            verify(response, 200, "Retrieve archived wallet history")
            assert response.get_json()["count"] == 2

            print("PASS: Archived wallet transaction history preserved")

            verify(
                owner.delete(
                    f"/api/cash-transactions/{income['id']}",
                    headers=owner_headers,
                ),
                404,
                "Cannot delete transaction from archived wallet",
            )

            print("PASS: Archived transaction deletion blocked")
            print("\nALL CASH TRANSACTION API TESTS PASSED!")

        finally:
            db.session.rollback()

            # Remove only transactions belonging to temporary users.
            # Transactions must be removed before their wallets.
            db.session.query(Transaction).filter(
                Transaction.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            for user_id in user_ids:
                user = db.session.get(User, user_id)

                if user is not None:
                    db.session.delete(user)

            db.session.commit()
            print("Temporary test data cleaned up.")


if __name__ == "__main__":
    run_tests()
