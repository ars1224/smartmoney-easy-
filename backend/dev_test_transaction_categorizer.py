
import unittest
from decimal import Decimal

from app.services.transaction_categorizer import (
    classify_bank_transaction,
    classify_budget_group,
)


class BankCategorizationTests(unittest.TestCase):

    def test_known_merchants(self):
        cases = [
            ("PAKNSAVE", "Groceries"),
            ("NEW WORLD", "Groceries"),
            ("NETFLIX", "Entertainment"),
            ("SPARK NZ", "Bills"),
            ("KFC", "Eating out"),
            ("Z ENERGY", "Transport"),
        ]

        for merchant, expected in cases:
            with self.subTest(merchant=merchant):
                result = classify_bank_transaction(
                    merchant,
                    Decimal("-25.00"),
                    "DEBIT",
                )
                self.assertEqual(result, expected)

    def test_unknown_merchant(self):
        self.assertIsNone(
            classify_bank_transaction(
                "UNKNOWN MERCHANT",
                Decimal("-45.00"),
                "DEBIT",
            )
        )

    def test_bank_transfer(self):
        category = classify_bank_transaction(
            "TRANSFER TO SPARK",
            Decimal("-200.00"),
            "TRANSFER",
        )

        self.assertEqual(category, "Transfer")

        # Transfers must not count as Needs/Wants spending.
        self.assertIsNone(
            classify_budget_group(category)
        )

    def test_savings_transfer_is_not_spending(self):
        category = classify_bank_transaction(
            "TRANSFER TO SAVINGS",
            Decimal("-200.00"),
            "TRANSFER",
        )

        self.assertEqual(
            category,
            "Savings Transfer",
        )

        self.assertIsNone(
            classify_budget_group(category)
        )

    def test_refunds_are_not_expenses(self):
        self.assertIsNone(
            classify_bank_transaction(
                "PAKNSAVE REFUND",
                Decimal("30.00"),
                "CREDIT",
            )
        )

    def test_zero_amount(self):
        self.assertIsNone(
            classify_bank_transaction(
                "NETFLIX",
                Decimal("0.00"),
                "DEBIT",
            )
        )

    
    def test_budget_group_mapping(self):
        from app.services.transaction_categorizer import (
            classify_budget_group,
        )

        cases = [
            ("Groceries", "NEEDS"),
            ("Transport", "NEEDS"),
            ("Bills", "NEEDS"),
            ("Eating out", "WANTS"),
            ("Shopping", "WANTS"),
            ("Entertainment", "WANTS"),
            ("Other", None),
            ("Income", None),
            (None, None),
        ]

        for category, expected in cases:
            with self.subTest(category=category):
                self.assertEqual(
                    classify_budget_group(category),
                    expected,
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)