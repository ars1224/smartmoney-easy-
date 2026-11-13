
import uuid
from datetime import datetime, timezone

from app.extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class BudgetMonthlyLimit(db.Model):
    __tablename__ = "budget_monthly_limits"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    budget_id = db.Column(
        db.String(36),
        db.ForeignKey("budgets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    month = db.Column(
        db.String(7),
        nullable=False,
    )

    monthly_limit = db.Column(
        db.Numeric(18, 2),
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
        db.UniqueConstraint(
            "budget_id",
            "month",
            name="uq_budget_monthly_limit",
        ),
        db.CheckConstraint(
            "monthly_limit > 0",
            name="ck_budget_monthly_limits_positive",
        ),
    )
