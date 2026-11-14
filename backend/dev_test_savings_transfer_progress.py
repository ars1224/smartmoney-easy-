import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    Numeric,
    String,
    create_engine,
)
from sqlalchemy.orm import Session, declarative_base

from app.routes import budgets as budgets_route


TestBase = declarative_base()

OCTOBER = datetime(2026, 10, 15, tzinfo=timezone.utc)
NOVEMBER = datetime(2026, 11, 2, tzinfo=timezone.utc)


class TestTransaction(TestBase):
    __tablename__ = "savings_test_transactions"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(36), nullable=False)
    source = Column(String(20), nullable=False)
    currency = Column(String(3), nullable=False)
    amount = Column(Numeric(18, 2), nullable=False)
    category = Column(String(80), nullable=True)
    transaction_date = Column(
        DateTime(timezone=True),
        nullable=False,
    )


class SavingsTransferProgressTests(unittest.TestCase):

    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:"
        )

        TestBase.metadata.create_all(self.engine)

        self.session = Session(self.engine)

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def add_transaction(
        self,
        amount,
        category,
        user_id="owner",
        source="BANK",
        currency="NZD",
        when=OCTOBER,
    ):
        self.session.add(
            TestTransaction(
                user_id=user_id,
                source=source,
                currency=currency,
                amount=Decimal(str(amount)),
                category=category,
                transaction_date=when,
            )
        )

    def savings_total(self, user_id, month):
        _, start, end = budgets_route.current_month(month)

        # Replace only the query's database and model.
        # No real PostgreSQL connection is used.
        with (
            patch.object(
                budgets_route,
                "Transaction",
                TestTransaction,
            ),
            patch.object(
                budgets_route,
                "db",
                SimpleNamespace(session=self.session),
            ),
        ):
            return budgets_route.get_monthly_savings_transferred(
                user_id,
                start,
                end,
            )

    def test_filters_savings_transfers_correctly(self):
        # Valid October savings transfers.
        self.add_transaction("-100.00", "Savings Transfer")
        self.add_transaction("-23.45", " savings TRANSFER ")

        # Incoming transactions must not count.
        self.add_transaction("100.00", "Savings Transfer")
        self.add_transaction("100.00", "Internal Transfer")

        # Ordinary transfers must not count.
        self.add_transaction("-50.00", "Transfer")

        # Cash and foreign-currency entries must not count.
        self.add_transaction(
            "-20.00",
            "Savings Transfer",
            source="CASH",
        )
        self.add_transaction(
            "-40.00",
            "Savings Transfer",
            currency="AUD",
        )

        # Another user's savings must remain separate.
        self.add_transaction(
            "-60.00",
            "Savings Transfer",
            user_id="other",
        )

        # November must remain separate from October.
        self.add_transaction(
            "-70.00",
            "Savings Transfer",
            when=NOVEMBER,
        )

        self.session.commit()

        self.assertEqual(
            self.savings_total("owner", "2026-10"),
            "123.45",
        )

        self.assertEqual(
            self.savings_total("owner", "2026-11"),
            "70.00",
        )

        self.assertEqual(
            self.savings_total("other", "2026-10"),
            "60.00",
        )

    def test_no_savings_transfers_returns_zero(self):
        self.assertEqual(
            self.savings_total("owner", "2026-10"),
            "0.00",
        )

if __name__ == "__main__":
    unittest.main()