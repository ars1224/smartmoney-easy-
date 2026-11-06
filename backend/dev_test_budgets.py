
import secrets
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import Budget, CashWallet, Transaction, User

from app.routes.budgets import current_month

from app.models import (
    BankAccount,
    BankConnection,
    Budget,
    CashWallet,
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


def authenticated_client(user_id):
    client = app.test_client()
    csrf = secrets.token_urlsafe(32)

    with client.session_transaction() as session:
        session["user_id"] = user_id
        session["csrf_token"] = csrf

    return client, {"X-CSRF-Token": csrf}


def run_tests():
    url = make_url(app.config["SQLALCHEMY_DATABASE_URI"])

    if (
        url.host not in ("localhost", "127.0.0.1")
        or url.database != "smartmoney_easy_test"
    ):
        raise RuntimeError(
            "Tests require the local smartmoney_easy_test database."
        )

    with app.app_context():
        suffix = uuid.uuid4().hex

        users = [
            User(email=f"budget-owner-{suffix}@example.test"),
            User(email=f"budget-other-{suffix}@example.test"),
        ]

        db.session.add_all(users)
        db.session.commit()

        user_ids = [user.id for user in users]
        connection_id = None

        try:
            owner, headers = authenticated_client(user_ids[0])
            other, other_headers = authenticated_client(user_ids[1])

            check(
                app.test_client().get("/api/budgets"),
                401,
                "Anonymous access blocked",
            )

            response = owner.get("/api/budgets")
            check(response, 200, "Retrieve empty budgets")
            assert response.get_json()["count"] == 0

            payload = {
                "category": "Groceries",
                "monthlyLimit": "400.00",
            }

            check(
                owner.post("/api/budgets", json=payload),
                403,
                "Missing CSRF token blocked",
            )

            response = owner.post(
                "/api/budgets",
                json=payload,
                headers=headers,
            )
            check(response, 201, "Create monthly budget")

            budget = response.get_json()["budget"]
            budget_id = budget["id"]

            assert budget["category"] == "Groceries"
            assert budget["monthlyLimit"] == "400.00"
            assert budget["spent"] == "0.00"

            check(
                owner.post(
                    "/api/budgets",
                    json=payload,
                    headers=headers,
                ),
                409,
                "Duplicate category rejected",
            )


            # Custom Other budget categories.
            custom_payload = {
                "category": "Other - Loan",
                "monthlyLimit": "50000.00",
            }

            response = owner.post(
                "/api/budgets",
                json=custom_payload,
                headers=headers,
            )
            check(response, 201, "Create custom Other budget")

            custom_budget = response.get_json()["budget"]
            assert custom_budget["category"] == "Other - Loan"
            assert custom_budget["monthlyLimit"] == "50000.00"

            check(
                owner.post(
                    "/api/budgets",
                    json=custom_payload,
                    headers=headers,
                ),
                409,
                "Duplicate custom Other budget rejected",
            )

            for invalid_category in (
                "Other - ",
                "Other - " + ("X" * 73),
                "Other - Loan\nInvalid",
            ):
                check(
                    owner.post(
                        "/api/budgets",
                        json={
                            "category": invalid_category,
                            "monthlyLimit": "100.00",
                        },
                        headers=headers,
                    ),
                    400,
                    "Invalid custom Other category rejected",
                )


            for invalid in (
                "0",
                "-10",
                "12.345",
                "NaN",
                "Infinity",
                True,
            ):
                check(
                    owner.post(
                        "/api/budgets",
                        json={
                            **payload,
                            "monthlyLimit": invalid,
                        },
                        headers=headers,
                    ),
                    400,
                    f"Invalid monthly limit {invalid!r}",
                )

            check(
                other.patch(
                    f"/api/budgets/{budget_id}",
                    json={"monthlyLimit": "999.00"},
                    headers=other_headers,
                ),
                404,
                "Another user cannot edit this budget",
            )

            response = other.get("/api/budgets")
            check(response, 200, "Other user can list budgets")
            assert response.get_json()["count"] == 0

            response = owner.post(
                "/api/cash-wallets",
                json={
                    "name": "Budget Test Wallet",
                    "currency": "NZD",
                    "openingBalance": "100.00",
                },
                headers=headers,
            )
            check(response, 201, "Create test cash wallet")

            wallet_id = response.get_json()["wallet"]["id"]

            today = datetime.now(
                ZoneInfo("Pacific/Auckland")
            ).date().isoformat()

            response = owner.post(
                "/api/cash-transactions",
                json={
                    "assetId": wallet_id,
                    "type": "expense",
                    "amount": "35.50",
                    "category": "Groceries",
                    "date": today,
                    "note": "Budget spending test",
                },
                headers=headers,
            )
            check(response, 201, "Create grocery expense")

            response = owner.get("/api/budgets")
            check(response, 200, "Recalculate monthly spending")

            budget = response.get_json()["budgets"][0]
            assert budget["spent"] == "35.50"

            response = owner.post(
                "/api/cash-transactions",
                json={
                    "assetId": wallet_id,
                    "type": "income",
                    "amount": "20.00",
                    "category": "Groceries",
                    "date": today,
                },
                headers=headers,
            )
            check(response, 201, "Create income transaction")

            response = owner.get("/api/budgets")
            assert response.get_json()["budgets"][0]["spent"] == "35.50"
            print("PASS: Income excluded from spending")

            check(
                owner.patch(
                    f"/api/budgets/{budget_id}",
                    json={"monthlyLimit": "500.00"},
                ),
                403,
                "Budget editing requires CSRF",
            )

            response = owner.patch(
                f"/api/budgets/{budget_id}",
                json={"monthlyLimit": "500.00"},
                headers=headers,
            )
            check(response, 200, "Update monthly limit")

            updated = response.get_json()["budget"]
            assert updated["monthlyLimit"] == "500.00"
            assert updated["spent"] == "35.50"

            # Test monthly spending boundaries.
            _, month_start, next_month_start = current_month()

            previous_month_expense = Transaction(
                user_id=user_ids[0],
                cash_wallet_id=wallet_id,
                source="CASH",
                description="Previous month groceries",
                category="Groceries",
                amount=Decimal("-75.00"),
                currency="NZD",
                transaction_type="expense",
                transaction_date=(
                    month_start - timedelta(seconds=1)
                ),
            )

            next_month_expense = Transaction(
                user_id=user_ids[0],
                cash_wallet_id=wallet_id,
                source="CASH",
                description="Next month groceries",
                category="Groceries",
                amount=Decimal("-50.00"),
                currency="NZD",
                transaction_type="expense",
                transaction_date=next_month_start,
            )

            db.session.add_all([
                previous_month_expense,
                next_month_expense,
            ])
            db.session.commit()

            response = owner.get("/api/budgets")
            check(
                response,
                200,
                "Retrieve budgets across month boundaries",
            )

            groceries = next(
                item
                for item in response.get_json()["budgets"]
                if item["category"] == "Groceries"
            )

            assert groceries["spent"] == "35.50"

            print(
                "PASS: Previous and next month "
                "expenses excluded"
            )


            # Verify the month selection API.
            nz_timezone = ZoneInfo("Pacific/Auckland")

            previous_month = (
                month_start - timedelta(seconds=1)
            ).astimezone(nz_timezone).strftime("%Y-%m")

            following_month = (
                next_month_start
            ).astimezone(nz_timezone).strftime("%Y-%m")

            for selected_month, expected_spent in [
                (previous_month, "75.00"),
                (following_month, "50.00"),
            ]:
                response = owner.get(
                    "/api/budgets",
                    query_string={"month": selected_month},
                )

                check(
                    response,
                    200,
                    f"Retrieve selected month {selected_month}",
                )

                data = response.get_json()
                assert data["month"] == selected_month

                groceries = next(
                    item for item in data["budgets"]
                    if item["category"] == "Groceries"
                )

                assert groceries["spent"] == expected_spent


            # Verify independent budget limits for each month.
            current_label, _, _ = current_month()

            response = owner.patch(
                f"/api/budgets/{budget_id}",
                query_string={"month": previous_month},
                json={"monthlyLimit": "300.00"},
                headers=headers,
            )
            check(response, 200, "Update previous month's limit")

            response = owner.patch(
                f"/api/budgets/{budget_id}",
                query_string={"month": current_label},
                json={"monthlyLimit": "650.00"},
                headers=headers,
            )
            check(response, 200, "Update current month's limit")

            for selected_month, expected_limit in (
                (previous_month, "300.00"),
                (current_label, "650.00"),
            ):
                response = owner.get(
                    "/api/budgets",
                    query_string={"month": selected_month},
                )
                check(response, 200, "Retrieve saved monthly limit")

                groceries = next(
                    item
                    for item in response.get_json()["budgets"]
                    if item["category"] == "Groceries"
                )

                assert groceries["monthlyLimit"] == expected_limit, (
                    selected_month,
                    groceries,
                )

            print("PASS: Monthly budget limits are independent")


            # Simulate an existing budget with no monthly overrides.
            legacy_budget = Budget(
                user_id=user_ids[0],
                category="Shopping",
                monthly_limit=Decimal("225.00"),
            )

            db.session.add(legacy_budget)
            db.session.commit()

            for selected_month in (
                previous_month,
                current_label,
            ):
                response = owner.get(
                    "/api/budgets",
                    query_string={"month": selected_month},
                )

                check(response, 200, "Read existing budget")

                shopping = next(
                    item
                    for item in response.get_json()["budgets"]
                    if item["category"] == "Shopping"
                )

                assert shopping["monthlyLimit"] == "225.00"

            # Update the previous month only.
            response = owner.patch(
                f"/api/budgets/{legacy_budget.id}",
                query_string={"month": previous_month},
                json={"monthlyLimit": "275.00"},
                headers=headers,
            )

            check(response, 200, "Update legacy budget month")

            for selected_month, expected in (
                (previous_month, "275.00"),
                (current_label, "225.00"),
            ):
                response = owner.get(
                    "/api/budgets",
                    query_string={"month": selected_month},
                )

                shopping = next(
                    item
                    for item in response.get_json()["budgets"]
                    if item["category"] == "Shopping"
                )

                assert shopping["monthlyLimit"] == expected

            db.session.refresh(legacy_budget)
            assert legacy_budget.monthly_limit == Decimal("225.00")

            print("PASS: Existing budget defaults preserved")



            # Reject invalid month formats and values.
            invalid_months = [
                "",
                "2026-0",
                "2026-00",
                "2026-13",
                "2026/10",
                "2026-10-01",
                "not-a-month",
                "0000-01",
                "9999-12",
            ]

            for invalid_month in invalid_months:
                response = owner.get(
                    "/api/budgets",
                    query_string={"month": invalid_month},
                )

                check(
                    response,
                    400,
                    f"Reject invalid month {invalid_month!r}",
                )

            print("PASS: Historical month selection")
            print("PASS: Invalid month validation")



            # Test categorised Mock Bank spending.
            connection = BankConnection(
                user_id=user_ids[0],
                provider="MOCK_BANK",
                external_customer_id=f"budget-test-{suffix}",
            )
            db.session.add(connection)
            db.session.flush()
            connection_id = connection.id

            account = BankAccount(
                connection_id=connection.id,
                external_account_id=f"account-{suffix}",
                currency="NZD",
                balance=Decimal("500.00"),
            )
            db.session.add(account)
            db.session.flush()

            bank_cases = [
                ("-24.50", "Groceries", "DEBIT"),
                ("-15.00", None, "DEBIT"),
                ("-40.00", "Groceries", "TRANSFER"),
                ("100.00", "Groceries", "CREDIT"),
                ("-50.00", "Other - Loan", "DEBIT"),
            ]

            for amount, category, transaction_type in bank_cases:
                transaction = Transaction(
                    user_id=user_ids[0],
                    bank_account_id=account.id,
                    external_transaction_id=uuid.uuid4().hex,
                    source="BANK",
                    description="Budget bank test",
                    category=category,
                    amount=Decimal(amount),
                    currency="NZD",
                    transaction_type=transaction_type,
                    transaction_date=month_start + timedelta(days=1),
                )
                db.session.add(transaction)

            db.session.commit()

            response = owner.get("/api/budgets")
            check(
                response,
                200,
                "Calculate categorised bank spending",
            )

            groceries = next(
                item
                for item in response.get_json()["budgets"]
                if item["category"] == "Groceries"
            )

            # Cash 35.50 + categorised bank 24.50 = 60.00.
            assert groceries["spent"] == "60.00", groceries

            other_loan = next(
                item
                for item in response.get_json()["budgets"]
                if item["category"] == "Other - Loan"
            )

            assert other_loan["spent"] == "50.00", other_loan

            print("PASS: Custom Other - Loan bank spending included")

            print("PASS: Categorised bank expenses included")
            print("PASS: Uncategorised bank expenses excluded")
            print("PASS: Transfers and income excluded")



        finally:
            db.session.rollback()

            db.session.query(Transaction).filter(
                Transaction.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            if connection_id is not None:
                db.session.query(BankAccount).filter(
                    BankAccount.connection_id == connection_id
                ).delete(synchronize_session=False)

                db.session.query(BankConnection).filter(
                    BankConnection.id == connection_id
                ).delete(synchronize_session=False)

            db.session.query(Budget).filter(
                Budget.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.session.query(CashWallet).filter(
                CashWallet.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.session.query(User).filter(
                User.id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.session.commit()
            print("Temporary test data cleaned up.")
    print("\nALL BUDGET API TESTS PASSED!")


if __name__ == "__main__":
    run_tests()
