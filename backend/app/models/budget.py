
import uuid
from datetime import datetime, timezone

from app.extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class Budget(db.Model):
    __tablename__ = "budgets"

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

    category = db.Column(
        db.String(80),
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
            "user_id",
            "category",
            name="uq_budget_user_category",
        ),
        db.CheckConstraint(
            "monthly_limit > 0",
            name="ck_budget_monthly_limit_positive",
        ),
    )
