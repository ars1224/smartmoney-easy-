
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class SavingsGoal(db.Model):
    __tablename__ = "savings_goals"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name = db.Column(
        db.String(80),
        nullable=False,
    )

    goal_group = db.Column(
        db.String(10),
        nullable=False,
        default="SAVINGS",
        server_default="SAVINGS",
    )

    target_amount = db.Column(
        db.Numeric(14, 2),
        nullable=False,
    )

    saved_amount = db.Column(
        db.Numeric(14, 2),
        nullable=False,
        default=lambda: Decimal("0.00"),
        server_default="0.00",
    )

    legacy_unverified_amount = db.Column(
        db.Numeric(14, 2),
        nullable=False,
        default=lambda: Decimal("0.00"),
        server_default="0.00",
    )

    target_date = db.Column(
        db.Date,
        nullable=False,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    achieved_at = db.Column(
        db.DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        db.CheckConstraint(
            "target_amount > 0",
            name="ck_savings_goals_target_positive",
        ),
        db.CheckConstraint(
            "saved_amount >= 0",
            name="ck_savings_goals_saved_nonnegative",
        ),

        db.CheckConstraint(
            "goal_group IN ('NEEDS', 'WANTS', 'SAVINGS')",
            name="ck_savings_goals_group",
        ),
        db.CheckConstraint(
            "legacy_unverified_amount >= 0",
            name="ck_savings_goals_legacy_nonnegative",
        ),
    )


class SavingsGoalContribution(db.Model):
    __tablename__ = "savings_goal_contributions"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    goal_id = db.Column(
        db.String(36),
        db.ForeignKey("savings_goals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    amount = db.Column(
        db.Numeric(14, 2),
        nullable=False,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    __table_args__ = (
        db.CheckConstraint(
            "amount > 0",
            name="ck_savings_contributions_positive",
        ),
    )

class GoalFundingMovement(db.Model):
    __tablename__ = "goal_funding_movements"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    goal_id = db.Column(
        db.String(36),
        db.ForeignKey("savings_goals.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    bank_account_id = db.Column(
        db.String(36),
        db.ForeignKey("bank_accounts.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    cash_wallet_id = db.Column(
        db.String(36),
        db.ForeignKey("cash_wallets.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    amount = db.Column(
        db.Numeric(14, 2),
        nullable=False,
    )

    request_id = db.Column(
        db.String(36),
        nullable=False,
    )

    transaction_id = db.Column(
        db.String(36),
        db.ForeignKey(
            "transactions.id",
            name="fk_goal_funding_movements_transaction_id",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    __table_args__ = (
        db.CheckConstraint(
            "amount <> 0",
            name="ck_goal_funding_amount_nonzero",
        ),
        db.CheckConstraint(
            "transaction_id IS NULL OR amount < 0",
            name="ck_goal_funding_spent_negative",
        ),
        db.UniqueConstraint(
            "transaction_id",
            name="uq_goal_funding_transaction",
        ),
        db.CheckConstraint(
            "("
            "bank_account_id IS NOT NULL "
            "AND cash_wallet_id IS NULL"
            ") OR ("
            "bank_account_id IS NULL "
            "AND cash_wallet_id IS NOT NULL"
            ")",
            name="ck_goal_funding_exactly_one_source",
        ),
        db.UniqueConstraint(
            "user_id",
            "request_id",
            name="uq_goal_funding_request",
        ),
    )
