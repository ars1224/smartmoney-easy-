
"""Add user payroll settings.

Revision ID: e7c19ad245b0
Revises: a6d0bc37e942
"""

from alembic import op
import sqlalchemy as sa


revision = "e7c19ad245b0"
down_revision = "a6d0bc37e942"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_payroll_settings",
        sa.Column(
            "user_id",
            sa.String(length=36),
            primary_key=True,
        ),
        sa.Column(
            "income_type",
            sa.String(length=10),
            nullable=False,
        ),
        sa.Column(
            "gross_amount",
            sa.Numeric(18, 2),
            nullable=False,
        ),
        sa.Column(
            "pay_frequency",
            sa.String(length=20),
            nullable=False,
        ),
        sa.Column(
            "hours_per_week",
            sa.Numeric(5, 2),
            nullable=True,
        ),
        sa.Column(
            "tax_code",
            sa.String(length=20),
            nullable=False,
        ),
        sa.Column(
            "kiwisaver_rate",
            sa.Numeric(5, 4),
            nullable=True,
        ),
        sa.Column(
            "has_student_loan",
            sa.Boolean(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "gross_amount >= 0",
            name="ck_payroll_gross_nonnegative",
        ),
        sa.CheckConstraint(
            "income_type IN ('SALARY', 'HOURLY')",
            name="ck_payroll_income_type",
        ),
        sa.CheckConstraint(
            """
            pay_frequency IN (
                'WEEKLY',
                'FORTNIGHTLY',
                'FOUR_WEEKLY',
                'MONTHLY',
                'YEARLY'
            )
            """,
            name="ck_payroll_frequency",
        ),
        sa.CheckConstraint(
            """
            (
                income_type = 'SALARY'
                AND hours_per_week IS NULL
            )
            OR
            (
                income_type = 'HOURLY'
                AND hours_per_week IS NOT NULL
                AND hours_per_week BETWEEN 0 AND 168
            )
            """,
            name="ck_payroll_type_fields",
        ),
        sa.CheckConstraint(
            """
            kiwisaver_rate IS NULL
            OR kiwisaver_rate BETWEEN 0 AND 0.10
            """,
            name="ck_payroll_kiwisaver_range",
        ),
    )


def downgrade():
    op.drop_table("user_payroll_settings")
