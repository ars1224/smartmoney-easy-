
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

    budget_group = db.Column(
        db.String(16),
        nullable=False,
        default="Savings",
        server_default="Savings",
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

    __table_args__ = (
        db.CheckConstraint(
            "budget_group IN ('Needs', 'Wants', 'Savings')",
            name="ck_savings_goals_budget_group",
        ),
        db.CheckConstraint(
            "target_amount > 0",
            name="ck_savings_goals_target_positive",
        ),
        db.CheckConstraint(
            "saved_amount >= 0",
            name="ck_savings_goals_saved_nonnegative",
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
