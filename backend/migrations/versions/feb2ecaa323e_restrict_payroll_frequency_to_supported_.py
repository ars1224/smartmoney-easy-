"""Restrict payroll frequency to supported values

Revision ID: feb2ecaa323e
Revises: f3a92c81d6b4
Create Date: 2026-11-10 15:19:19.110604

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'feb2ecaa323e'
down_revision = 'f3a92c81d6b4'
branch_labels = None
depends_on = None


def upgrade():
    # Remove the old payroll frequency constraint.
    op.drop_constraint(
        "ck_payroll_frequency",
        "user_payroll_settings",
        type_="check",
    )

    # Only permit frequencies supported by
    # the NZ payroll calculation engine.
    op.create_check_constraint(
        "ck_payroll_frequency",
        "user_payroll_settings",
        """
        pay_frequency IN (
            'WEEKLY',
            'FORTNIGHTLY',
            'FOUR_WEEKLY',
            'MONTHLY'
        )
        """,
    )


def downgrade():
    # Restore the original constraint.
    op.drop_constraint(
        "ck_payroll_frequency",
        "user_payroll_settings",
        type_="check",
    )

    op.create_check_constraint(
        "ck_payroll_frequency",
        "user_payroll_settings",
        """
        pay_frequency IN (
            'WEEKLY',
            'FORTNIGHTLY',
            'FOUR_WEEKLY',
            'MONTHLY',
            'YEARLY'
        )
        """,
    )
