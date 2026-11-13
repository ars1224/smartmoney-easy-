
"""add regular income profiles

Revision ID: 9e03132931a5
Revises: 8d83871a4b76
"""

from alembic import op
import sqlalchemy as sa


# Alembic revision identifiers.
revision = "9e03132931a5"
down_revision = "8d83871a4b76"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "regular_income_profiles",

        sa.Column(
            "id",
            sa.String(length=36),
            primary_key=True,
        ),

        sa.Column(
            "user_id",
            sa.String(length=36),
            nullable=False,
        ),

        sa.Column(
            "income_type",
            sa.String(length=10),
            nullable=False,
        ),

        sa.Column(
            "amount",
            sa.Numeric(18, 2),
            nullable=False,
        ),

        sa.Column(
            "pay_frequency",
            sa.String(length=20),
            nullable=True,
        ),

        sa.Column(
            "hours_per_week",
            sa.Numeric(5, 2),
            nullable=True,
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

        sa.UniqueConstraint(
            "user_id",
            name="uq_regular_income_profiles_user_id",
        ),

        sa.CheckConstraint(
            "amount >= 0",
            name="ck_regular_income_nonnegative",
        ),

        sa.CheckConstraint(
            """
            (
                income_type = 'SALARY'
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
                AND hours_per_week BETWEEN 0 AND 168
            )
            """,
            name="ck_regular_income_type_fields",
        ),
    )


def downgrade():
    op.drop_table("regular_income_profiles")
