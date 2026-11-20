import unittest

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

from config import Config
from app import create_app
from app.extensions import db
from app.models import (
    Budget,
    BudgetMonthlyLimit,
    User,
)


class MonthlyIncomeBudgetTests(unittest.TestCase):

    def setUp(self):
        # All tests must use an isolated SQLite database.
        with patch.object(
            Config,
            "SQLALCHEMY_DATABASE_URI",
            "sqlite:///:memory:"
        ), patch.object(
            Config,
            "SECRET_KEY",
            "monthly-income-test-only"
        ):
            self.app = create_app()

        self.app.config.update(TESTING=True)

        self.app_context = self.app.app_context()
        self.app_context.push()

        # Safety guard: never modify PostgreSQL.
        database_url = db.engine.url

        if (
            not database_url.drivername.startswith("sqlite")
            or database_url.database != ":memory:"
        ):
            self.app_context.pop()

            raise RuntimeError(
                "Monthly income tests require "
                "an in-memory SQLite database."
            )

        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def csrf_headers(self, client):
        response = client.get("/api/auth/csrf")

        self.assertEqual(
            response.status_code,
            200
        )

        csrf_token = response.get_json()["csrf_token"]

        return {
            "X-CSRF-Token": csrf_token
        }

    def register_user(self, email):
        # Each user receives an independent browser session.
        client = self.app.test_client()

        response = client.post(
            "/api/auth/register",
            json={
                "name": "Monthly Budget QA",
                "email": email,
                "password": "SyntheticOnlyPassword123!"
            },
            headers=self.csrf_headers(client)
        )

        self.assertEqual(
            response.status_code,
            201,
            response.get_json()
        )

        return client

    def create_budget(
        self,
        client,
        month,
        category,
        monthly_limit,
        budget_group,
    ):
        response = client.post(
            f"/api/budgets?month={month}",
            json={
                "category": category,
                "monthlyLimit": str(monthly_limit),
                "budgetGroup": budget_group,
            },
            headers=self.csrf_headers(client)
        )

        self.assertEqual(
            response.status_code,
            201,
            response.get_json()
        )

        return response.get_json()["budget"]["id"]

    def get_monthly_income(self, client, month):
        response = client.get(
            f"/api/monthly-income?month={month}"
        )

        self.assertEqual(
            response.status_code,
            200,
            response.get_json()
        )

        return response.get_json()

    def get_category_allocation(self, client, month):
        response = client.get(
            f"/api/budgets?month={month}"
        )

        self.assertEqual(
            response.status_code,
            200,
            response.get_json()
        )

        budgets = response.get_json()["budgets"]

        return sum(
            (
                Decimal(budget["monthlyLimit"])
                for budget in budgets
            ),
            Decimal("0.00"),
        )

    def save_monthly_income(
        self,
        client,
        month,
        expected_income,
    ):
        response = client.put(
            f"/api/monthly-income?month={month}",
            json={
                "expectedIncome": str(expected_income)
            },
            headers=self.csrf_headers(client)
        )

        self.assertEqual(
            response.status_code,
            200,
            response.get_json()
        )

    def test_future_budgets_do_not_affect_earlier_months(self):
        client = self.register_user(
            "monthly-future@example.test"
        )

        # Create a budget effective from October.
        self.create_budget(
            client,
            "2026-10",
            "Groceries",
            "210.00",
            "NEEDS",
        )

        # Create another budget effective from November.
        self.create_budget(
            client,
            "2026-11",
            "Shopping",
            "300.00",
            "WANTS",
        )

        expected_allocations = {
            "2026-09": Decimal("0.00"),
            "2026-10": Decimal("210.00"),
            "2026-11": Decimal("510.00"),
            "2026-12": Decimal("510.00"),
        }

        for month, expected in expected_allocations.items():
            with self.subTest(month=month):
                result = self.get_monthly_income(
                    client,
                    month,
                )

                actual = Decimal(
                    result["allocatedBudget"]
                )

                self.assertEqual(
                    actual,
                    expected
                )

                # Monthly Income and Budgets must agree.
                category_total = self.get_category_allocation(
                    client,
                    month,
                )

                self.assertEqual(
                    actual,
                    category_total
                )

    def test_november_revision_does_not_change_october(self):
        client = self.register_user(
            "monthly-revision@example.test"
        )

        self.create_budget(
            client,
            "2026-10",
            "Groceries",
            "210.00",
            "NEEDS",
        )

        shopping_id = self.create_budget(
            client,
            "2026-11",
            "Shopping",
            "300.00",
            "WANTS",
        )

        # Revise November Shopping from 300 to 395.
        response = client.patch(
            f"/api/budgets/{shopping_id}?month=2026-11",
            json={
                "monthlyLimit": "395.00"
            },
            headers=self.csrf_headers(client)
        )

        self.assertEqual(
            response.status_code,
            200,
            response.get_json()
        )

        # Save the same expected income for both months.
        self.save_monthly_income(
            client,
            "2026-10",
            "1000.00",
        )

        self.save_monthly_income(
            client,
            "2026-11",
            "1000.00",
        )

        october = self.get_monthly_income(
            client,
            "2026-10",
        )

        november = self.get_monthly_income(
            client,
            "2026-11",
        )

        # October must remain unchanged.
        self.assertEqual(
            Decimal(october["allocatedBudget"]),
            Decimal("210.00")
        )

        self.assertEqual(
            Decimal(october["unallocatedBudget"]),
            Decimal("790.00")
        )

        # November must include the revised amount.
        self.assertEqual(
            Decimal(november["allocatedBudget"]),
            Decimal("605.00")
        )

        self.assertEqual(
            Decimal(november["unallocatedBudget"]),
            Decimal("395.00")
        )

        # Both endpoints must use identical effective limits.
        self.assertEqual(
            Decimal(october["allocatedBudget"]),
            self.get_category_allocation(
                client,
                "2026-10",
            )
        )

        self.assertEqual(
            Decimal(november["allocatedBudget"]),
            self.get_category_allocation(
                client,
                "2026-11",
            )
        )

    def test_legacy_budget_starts_from_its_creation_month(self):
        email = "monthly-legacy@example.test"

        client = self.register_user(email)

        user = User.query.filter_by(
            email=email
        ).first()

        self.assertIsNotNone(user)

        # Simulate an existing budget created before
        # monthly history records were introduced.
        legacy_budget = Budget(
            user_id=user.id,
            category="Fuel",
            budget_group="NEEDS",
            monthly_limit=Decimal("45.00"),
        )

        legacy_budget.created_at = datetime(
            2026,
            10,
            15,
            tzinfo=timezone.utc,
        )

        db.session.add(legacy_budget)
        db.session.commit()

        # Confirm this really is a legacy budget.
        history_count = BudgetMonthlyLimit.query.filter_by(
            budget_id=legacy_budget.id
        ).count()

        self.assertEqual(
            history_count,
            0
        )

        expected_allocations = {
            "2026-09": Decimal("0.00"),
            "2026-10": Decimal("45.00"),
            "2026-11": Decimal("45.00"),
        }

        for month, expected in expected_allocations.items():
            with self.subTest(month=month):
                result = self.get_monthly_income(
                    client,
                    month,
                )

                actual = Decimal(
                    result["allocatedBudget"]
                )

                self.assertEqual(
                    actual,
                    expected
                )

                self.assertEqual(
                    actual,
                    self.get_category_allocation(
                        client,
                        month,
                    )
                )

    def test_budget_allocations_are_isolated_per_user(self):
        client_a = self.register_user(
            "monthly-user-a@example.test"
        )

        client_b = self.register_user(
            "monthly-user-b@example.test"
        )

        # User A has an October Groceries budget.
        self.create_budget(
            client_a,
            "2026-10",
            "Groceries",
            "210.00",
            "NEEDS",
        )

        # User B has completely different allocations.
        self.create_budget(
            client_b,
            "2026-10",
            "Groceries",
            "1.00",
            "NEEDS",
        )

        self.create_budget(
            client_b,
            "2026-11",
            "Savings",
            "2.00",
            "SAVINGS",
        )

        user_a_october = self.get_monthly_income(
            client_a,
            "2026-10",
        )

        user_a_november = self.get_monthly_income(
            client_a,
            "2026-11",
        )

        user_b_october = self.get_monthly_income(
            client_b,
            "2026-10",
        )

        user_b_november = self.get_monthly_income(
            client_b,
            "2026-11",
        )

        # User A's allocation must remain independent.
        self.assertEqual(
            Decimal(user_a_october["allocatedBudget"]),
            Decimal("210.00")
        )

        self.assertEqual(
            Decimal(user_a_november["allocatedBudget"]),
            Decimal("210.00")
        )

        # User B's November Savings budget
        # must not appear in October.
        self.assertEqual(
            Decimal(user_b_october["allocatedBudget"]),
            Decimal("1.00")
        )

        self.assertEqual(
            Decimal(user_b_november["allocatedBudget"]),
            Decimal("3.00")
        )


if __name__ == "__main__":
    unittest.main()