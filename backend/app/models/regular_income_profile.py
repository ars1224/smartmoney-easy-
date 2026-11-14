
import uuid
from datetime import datetime, timezone

from app.extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class RegularIncomeProfile(db.Model):
    __tablename__ = "regular_income_profiles"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # SALARY or HOURLY
    income_type = db.Column(
        db.String(10),
        nullable=False,
    )

    # Take-home pay per pay period, or hourly rate.
    amount = db.Column(
        db.Numeric(18, 2),
        nullable=False,
    )

    # Salary: WEEKLY, FORTNIGHTLY, MONTHLY, YEARLY
    # Hourly: not applicable.
    pay_frequency = db.Column(
        db.String(20),
        nullable=True,
    )

    # Hourly workers only.
    hours_per_week = db.Column(
        db.Numeric(5, 2),
        nullable=True,
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
            name="uq_regular_income_profiles_user_id",
        ),
        db.CheckConstraint(
            "amount >= 0",
            name="ck_regular_income_nonnegative",
        ),
        db.CheckConstraint(
            """
            (
                income_type = 'SALARY'
                AND pay_frequency IS NOT NULL
                AND pay_frequency IN (
                    'WEEKLY',
                    'FORTNIGHTLY',
                    'MONTHLY',
                    'YEARLY'
                )
                AND hours_per_week IS NULL
            )
            OR
            (
                income_type = 'HOURLY'
                AND pay_frequency IS NULL
                AND hours_per_week IS NOT NULL
                AND hours_per_week BETWEEN 0 AND 168
            )
            """,
            name="ck_regular_income_type_fields",
        ),
    )