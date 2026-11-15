import unittest
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from app.services.goal_funding import (
    GoalFundingError,
    get_funding_source,
)


class CashWalletFundingTests(unittest.TestCase):

    def setUp(self):
        self.cash_patcher = patch(
            "app.services.goal_funding.CashWallet"
        )
        self.db_patcher = patch(
            "app.services.goal_funding.db"
        )
        self.balance_patcher = patch(
            "app.services.goal_funding.calculate_wallet_balance"
        )

        self.mock_cash = self.cash_patcher.start()
        self.mock_db = self.db_patcher.start()
        self.mock_balance = self.balance_patcher.start()

        self.addCleanup(self.cash_patcher.stop)
        self.addCleanup(self.db_patcher.stop)
        self.addCleanup(self.balance_patcher.stop)

        self.wallet = SimpleNamespace(
            id="wallet-123",
            user_id="user-123",
            name="Personal Cash",
            currency="NZD",
            is_archived=False,
        )

        self.mock_cash.query.filter_by.return_value.first.return_value = (
            self.wallet
        )

        self.mock_balance.return_value = Decimal("500.00")

        self.mock_db.session.query.return_value.filter.return_value.scalar.return_value = (
            Decimal("200.00")
        )

    def test_available_balance_excludes_reservations(self):
        result = get_funding_source(
            "user-123",
            "CASH_WALLET",
            "wallet-123",
        )

        self.assertEqual(
            result["currentBalance"],
            Decimal("500.00"),
        )

        self.assertEqual(
            result["allocated"],
            Decimal("200.00"),
        )

        self.assertEqual(
            result["available"],
            Decimal("300.00"),
        )

        self.assertEqual(
            result["shortfall"],
            Decimal("0.00"),
        )

    def test_balance_below_reservations_creates_shortfall(self):
        self.mock_balance.return_value = Decimal("100.00")

        result = get_funding_source(
            "user-123",
            "CASH_WALLET",
            "wallet-123",
        )

        self.assertEqual(
            result["allocated"],
            Decimal("200.00"),
        )

        self.assertEqual(
            result["available"],
            Decimal("0.00"),
        )

        self.assertEqual(
            result["shortfall"],
            Decimal("100.00"),
        )

    def test_zero_reservations_leave_balance_available(self):
        self.mock_db.session.query.return_value.filter.return_value.scalar.return_value = (
            None
        )

        result = get_funding_source(
            "user-123",
            "CASH_WALLET",
            "wallet-123",
        )

        self.assertEqual(
            result["allocated"],
            Decimal("0.00"),
        )

        self.assertEqual(
            result["available"],
            Decimal("500.00"),
        )

    def test_archived_wallet_cannot_be_used_for_allocation(self):
        self.wallet.is_archived = True

        with self.assertRaises(GoalFundingError) as context:
            get_funding_source(
                "user-123",
                "CASH_WALLET",
                "wallet-123",
            )

        self.assertEqual(
            context.exception.status_code,
            409,
        )

    def test_archived_wallet_allows_existing_release(self):
        self.wallet.is_archived = True

        result = get_funding_source(
            "user-123",
            "CASH_WALLET",
            "wallet-123",
            allow_inactive=True,
        )

        self.assertFalse(result["isAvailable"])

        self.assertEqual(
            result["allocated"],
            Decimal("200.00"),
        )

    def test_other_users_wallet_not_found(self):
        self.mock_cash.query.filter_by.return_value.first.return_value = (
            None
        )

        with self.assertRaises(GoalFundingError) as context:
            get_funding_source(
                "different-user",
                "CASH_WALLET",
                "wallet-123",
            )

        self.assertEqual(
            context.exception.status_code,
            404,
        )

        self.mock_cash.query.filter_by.assert_called_with(
            id="wallet-123",
            user_id="different-user",
        )

    def test_source_lock_requested_during_allocation(self):
        query = self.mock_cash.query.filter_by.return_value

        query.with_for_update.return_value.first.return_value = (
            self.wallet
        )

        result = get_funding_source(
            "user-123",
            "CASH_WALLET",
            "wallet-123",
            lock=True,
        )

        query.with_for_update.assert_called_once_with()

        self.assertEqual(
            result["available"],
            Decimal("300.00"),
        )

    def test_invalid_source_type_rejected(self):
        with self.assertRaises(GoalFundingError) as context:
            get_funding_source(
                "user-123",
                "INVALID",
                "source-123",
            )

        self.assertEqual(
            context.exception.status_code,
            400,
        )

    def test_negative_reservation_total_rejected(self):
        self.mock_db.session.query.return_value.filter.return_value.scalar.return_value = (
            Decimal("-10.00")
        )

        with self.assertRaises(GoalFundingError) as context:
            get_funding_source(
                "user-123",
                "CASH_WALLET",
                "wallet-123",
            )

        self.assertEqual(
            context.exception.status_code,
            409,
        )

    def test_reading_funding_does_not_write_to_database(self):
        get_funding_source(
            "user-123",
            "CASH_WALLET",
            "wallet-123",
        )

        self.mock_db.session.add.assert_not_called()
        self.mock_db.session.commit.assert_not_called()
        self.mock_db.session.delete.assert_not_called()


if __name__ == "__main__":
    unittest.main()