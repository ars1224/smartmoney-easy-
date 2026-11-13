
"""Strengthen regular income required-field constraints.

Revision ID: bc62f914d8ae
Revises: 9e03132931a5
"""

from alembic import op


revision = "bc62f914d8ae"
down_revision = "9e03132931a5"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint(
        "ck_regular_income_type_fields",
        "regular_income_profiles",
        type_="check",
    )

    op.create_check_constraint(
        "ck_regular_income_type_fields",
        "regular_income_profiles",
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
    )


def downgrade():
    op.drop_constraint(
        "ck_regular_income_type_fields",
        "regular_income_profiles",
        type_="check",
    )

    op.create_check_constraint(
        "ck_regular_income_type_fields",
        "regular_income_profiles",
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
    )
