
import uuid
from datetime import datetime, timezone

from app.extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class BudgetAllocationPlan(db.Model):
    __tablename__ = "budget_allocation_plans"

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

    month = db.Column(
        db.String(7),
        nullable=False,
    )

    needs_percent = db.Column(
        db.Integer,
        nullable=False,
        default=55,
    )

    savings_percent = db.Column(
        db.Integer,
        nullable=False,
        default=25,
    )

    wants_percent = db.Column(
        db.Integer,
        nullable=False,
        default=20,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    __table_args__ = (
        db.UniqueConstraint(
            "user_id",
            "month",
            name="uq_budget_allocation_user_month",
        ),
        db.CheckConstraint(
            "needs_percent BETWEEN 0 AND 100",
            name="ck_budget_allocation_needs",
        ),
        db.CheckConstraint(
            "savings_percent BETWEEN 0 AND 100",
            name="ck_budget_allocation_savings",
        ),
        db.CheckConstraint(
            "wants_percent BETWEEN 0 AND 100",
            name="ck_budget_allocation_wants",
        ),
        db.CheckConstraint(
            """
            needs_percent
            + savings_percent
            + wants_percent = 100
            """,
            name="ck_budget_allocation_total",
        ),
    )