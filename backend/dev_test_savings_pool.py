import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from flask import Flask

from app.routes import savings_goals as routes


def make_source(balance, allocated, available, shortfall="0.00"):
    return {
        "currentBalance": Decimal(balance),
        "allocated": Decimal(allocated),
        "available": Decimal(available),
        "shortfall": Decimal(shortfall),
    }


class SavingsPoolTests(unittest.TestCase):

    def setUp(self):
        self.app = Flask(__name__)
        self.context = self.app.test_request_context()
        self.context.push()

    def tearDown(self):
        self.context.pop()

    def get_summary(self, accounts, sources):
        query = MagicMock()

        query.join.return_value.filter.return_value.all.return_value = (
            accounts
        )

        fake_db = SimpleNamespace(
            session=SimpleNamespace(
                query=MagicMock(return_value=query)
            )
        )

        def fake_funding_source(user_id, source_type, source_id):
            self.assertEqual(user_id, "qa-user")
            self.assertEqual(source_type, "BANK_ACCOUNT")
            return sources[source_id]

        with (
            patch.object(routes, "db", fake_db),
            patch.object(
                routes,
                "get_authenticated_user_id",
                return_value="qa-user",
            ),
            patch.object(
                routes,
                "get_funding_source",
                side_effect=fake_funding_source,
            ),
        ):
            response, status = routes.get_savings_funding_summary()

        return response.get_json(), status, response

    def test_no_connected_savings_account(self):
        result, status, response = self.get_summary([], {})

        self.assertEqual(status, 200)
        self.assertEqual(result["savingsAccountCount"], 0)
        self.assertIsNone(result["linkedSavingsBalance"])
        self.assertIsNone(result["allocatedFromSavings"])
        self.assertIsNone(result["availableForGoals"])
        self.assertIsNone(result["savingsShortfall"])
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_single_savings_account(self):
        accounts = [
            SimpleNamespace(
                id="savings-1",
                last_synced_at=None,
            )
        ]

        sources = {
            "savings-1": make_source(
                "1500.00",
                "1000.00",
                "500.00",
            )
        }

        result, status, _ = self.get_summary(accounts, sources)

        self.assertEqual(status, 200)
        self.assertEqual(result["linkedSavingsBalance"], "1500.00")
        self.assertEqual(result["allocatedFromSavings"], "1000.00")
        self.assertEqual(result["availableForGoals"], "500.00")
        self.assertEqual(result["savingsShortfall"], "0.00")

    def test_multiple_accounts_with_shortfall(self):
        accounts = [
            SimpleNamespace(
                id="savings-1",
                last_synced_at=None,
            ),
            SimpleNamespace(
                id="savings-2",
                last_synced_at=None,
            ),
        ]

        sources = {
            "savings-1": make_source(
                "1000.00",
                "300.00",
                "700.00",
            ),
            "savings-2": make_source(
                "500.00",
                "600.00",
                "0.00",
                "100.00",
            ),
        }

        result, status, _ = self.get_summary(accounts, sources)

        self.assertEqual(status, 200)
        self.assertEqual(result["savingsAccountCount"], 2)
        self.assertEqual(result["linkedSavingsBalance"], "1500.00")
        self.assertEqual(result["allocatedFromSavings"], "900.00")
        self.assertEqual(result["availableForGoals"], "700.00")
        self.assertEqual(result["savingsShortfall"], "100.00")

    def test_unauthenticated_request(self):
        with patch.object(
            routes,
            "get_authenticated_user_id",
            return_value=None,
        ):
            response, status = routes.get_savings_funding_summary()

        self.assertEqual(status, 401)
        self.assertEqual(
            response.get_json()["error"],
            "Authentication required.",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)