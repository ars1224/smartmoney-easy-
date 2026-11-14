"""allow savings budget group

Revision ID: 545d669fced4
Revises: 66222b499d5a
Create Date: 2026-11-13 20:44:36.577945

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '545d669fced4'
down_revision = '66222b499d5a'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint(
        "ck_budget_group",
        "budgets",
        type_="check",
    )

    op.create_check_constraint(
        "ck_budget_group",
        "budgets",
        "budget_group IN ('NEEDS', 'WANTS', 'SAVINGS')",
    )


def downgrade():
    op.drop_constraint(
        "ck_budget_group",
        "budgets",
        type_="check",
    )

    op.create_check_constraint(
        "ck_budget_group",
        "budgets",
        "budget_group IN ('NEEDS', 'WANTS')",
    )