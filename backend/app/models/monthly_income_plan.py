
import uuid
from datetime import datetime, timezone

from app.extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class MonthlyIncomePlan(db.Model):
    __tablename__ = "monthly_income_plans"

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

    expected_income = db.Column(
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
            "user_id",
            "month",
            name="uq_monthly_income_plan_user_month",
        ),
        db.CheckConstraint(
            "expected_income >= 0",
            name="ck_monthly_income_expected_nonnegative",
        ),
    )
