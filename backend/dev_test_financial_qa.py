import unittest
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.services.goal_funding import GoalFundingError
from app.services.goal_purchases import get_purchase_source
from app.services.reports import summarise


NZ = ZoneInfo("Pacific/Auckland")


def make_transaction(**changes):
    data = {
        "source": "BANK",
        "bank_account_id": "qa-bank-account",
        "cash_wallet_id": None,
        "currency": "NZD",
        "amount": Decimal("-45.00"),
        "transaction_type": "DEBIT",
        "category": "Eating out",
        "description": "RESTAURANT QA TEST",
        "transaction_date": datetime(
            2026, 11, 16, 12, 0, tzinfo=NZ
        ),
    }
    data.update(changes)
    return SimpleNamespace(**data)


class FinancialQATests(unittest.TestCase):

    def test_savings_transfer_category_cannot_be_goal_purchase(self):
        transaction = make_transaction(
            amount=Decimal("-250.00"),
            category="Savings Transfer",
        )

        with self.assertRaises(GoalFundingError):
            get_purchase_source(transaction)

    def test_savings_transfer_description_cannot_be_goal_purchase(self):
        transaction = make_transaction(
            amount=Decimal("-250.00"),
            category="Other",
            description="SAVINGS TRANSFER QA TEST",
        )

        with self.assertRaises(GoalFundingError):
            get_purchase_source(transaction)

    def test_legitimate_purchase_remains_allowed(self):
        transaction = make_transaction()

        source_type, source_id, amount = get_purchase_source(
            transaction
        )

        self.assertEqual(source_type, "BANK_ACCOUNT")
        self.assertEqual(source_id, "qa-bank-account")
        self.assertEqual(amount, Decimal("45.00"))

    def test_refund_is_included_in_cash_flow(self):
        transactions = [
            make_transaction(
                amount=Decimal("3080.00"),
                transaction_type="CREDIT",
                category="Income",
                description="QA SALARY",
            ),
            make_transaction(
                amount=Decimal("-280.50"),
                category="Groceries",
            ),
            make_transaction(
                amount=Decimal("-45.00"),
                category="Eating out",
            ),
            make_transaction(
                amount=Decimal("-250.00"),
                category="Savings Transfer",
                description="SAVINGS TRANSFER QA TEST",
            ),
            make_transaction(
                amount=Decimal("20.00"),
                transaction_type="CREDIT",
                category="Refund",
                description="PAKNSAVE REFUND QA TEST",
            ),
        ]

        result = summarise(transactions, "2026-11", "ALL")

        self.assertEqual(result["income"], "3080.00")
        self.assertEqual(result["expenses"], "325.50")
        self.assertEqual(result["refunds"], "20.00")
        self.assertEqual(result["netCashFlow"], "2774.50")

    def test_unconfirmed_refund_is_not_ordinary_income(self):
        transaction = make_transaction(
            amount=Decimal("20.00"),
            transaction_type="CREDIT",
            category="Uncategorised",
            description="PAKNSAVE REFUND QA TEST",
        )

        result = summarise([transaction], "2026-11", "ALL")

        self.assertEqual(result["income"], "0.00")
        self.assertEqual(result["refunds"], "0.00")
        self.assertEqual(result["excluded"]["reviewNeeded"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)