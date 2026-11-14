"""Add transaction budget group override

Revision ID: 8ea3b149255c
Revises: c092e62b97c5
Create Date: 2026-11-13 12:04:05.746261

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8ea3b149255c'
down_revision = 'c092e62b97c5'
branch_labels = None
depends_on = None



def upgrade():
    op.add_column(
        "transactions",
        sa.Column(
            "budget_group_override",
            sa.String(length=10),
            nullable=True,
        ),
    )

    op.create_check_constraint(
        "ck_transactions_budget_group_override",
        "transactions",
        "budget_group_override IS NULL OR "
        "budget_group_override IN "
        "('NEEDS', 'WANTS', 'SAVINGS', 'NONE')",
    )


def downgrade():
    op.drop_constraint(
        "ck_transactions_budget_group_override",
        "transactions",
        type_="check",
    )

    op.drop_column(
        "transactions",
        "budget_group_override",
    )