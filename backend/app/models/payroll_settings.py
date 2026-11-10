
from datetime import datetime, timezone

from app.extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class PayrollSettings(db.Model):
    __tablename__ = "user_payroll_settings"

    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # SALARY: gross amount per pay period
    # HOURLY: gross hourly rate
    income_type = db.Column(
        db.String(10),
        nullable=False,
    )

    gross_amount = db.Column(
        db.Numeric(18, 2),
        nullable=False,
    )

    # Required for both salary and hourly employees.
    pay_frequency = db.Column(
        db.String(20),
        nullable=False,
    )

    hours_per_week = db.Column(
        db.Numeric(5, 2),
        nullable=True,
    )

    tax_code = db.Column(
        db.String(20),
        nullable=False,
    )

    # 0.0350 represents 3.5%.
    # NULL means no employee KiwiSaver deduction.
    kiwisaver_rate = db.Column(
        db.Numeric(5, 4),
        nullable=True,
    )

    has_student_loan = db.Column(
        db.Boolean,
        nullable=False,
        default=False,
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
        db.CheckConstraint(
            "gross_amount >= 0",
            name="ck_payroll_gross_nonnegative",
        ),
        db.CheckConstraint(
            """
            income_type IN ('SALARY', 'HOURLY')
            """,
            name="ck_payroll_income_type",
        ),
        db.CheckConstraint(
            """
            pay_frequency IN (
                'WEEKLY',
                'FORTNIGHTLY',
                'FOUR_WEEKLY',
                'MONTHLY',
            )
            """,
            name="ck_payroll_frequency",
        ),
        db.CheckConstraint(
            """
            pay_frequency IN (
                'WEEKLY',
                'FORTNIGHTLY',
                'FOUR_WEEKLY',
                'MONTHLY'
            )
            """,
            name="ck_payroll_frequency",
        ),
        db.CheckConstraint(
            """
            kiwisaver_rate IS NULL
            OR kiwisaver_rate BETWEEN 0 AND 0.10
            """,
            name="ck_payroll_kiwisaver_range",
        ),
    )
