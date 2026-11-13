"""Add budget groups

Revision ID: 66222b499d5a
Revises: 8ea3b149255c
Create Date: 2026-11-13 17:12:22.254139

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '66222b499d5a'
down_revision = '8ea3b149255c'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column(
        "budgets",
        sa.Column(
            "budget_group",
            sa.String(length=10),
            nullable=True,
        ),
    )

    op.create_check_constraint(
        "ck_budget_group",
        "budgets",
        "budget_group IN ('NEEDS', 'WANTS')",
    )


def downgrade():
    op.drop_constraint(
        "ck_budget_group",
        "budgets",
        type_="check",
    )

    op.drop_column(
        "budgets",
        "budget_group",
    )