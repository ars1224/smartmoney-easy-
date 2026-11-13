"""Add goal group classification to savings goals

Revision ID: 3094d796a5e4
Revises: feb2ecaa323e
Create Date: 2026-11-11 00:51:10.337325

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3094d796a5e4'
down_revision = 'feb2ecaa323e'
branch_labels = None
depends_on = None


def upgrade():
    # Existing goals are classified as Savings
    # without changing their financial data.
    op.add_column(
        "savings_goals",
        sa.Column(
            "goal_group",
            sa.String(length=10),
            nullable=False,
            server_default="SAVINGS",
        ),
    )

    # Restrict values to the three supported groups.
    op.create_check_constraint(
        "ck_savings_goals_group",
        "savings_goals",
        "goal_group IN ('NEEDS', 'WANTS', 'SAVINGS')",
    )


def downgrade():
    # Remove the constraint before removing the column.
    op.drop_constraint(
        "ck_savings_goals_group",
        "savings_goals",
        type_="check",
    )

    op.drop_column(
        "savings_goals",
        "goal_group",
    )