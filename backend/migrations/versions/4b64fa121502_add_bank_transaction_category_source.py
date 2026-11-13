"""add bank transaction category source

Revision ID: 4b64fa121502
Revises: 54d3333cc103
Create Date: 2026-11-11 21:53:15.200653

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4b64fa121502'
down_revision = '54d3333cc103'
branch_labels = None
depends_on = None



def upgrade():
    op.add_column(
        "transactions",
        sa.Column(
            "category_source",
            sa.String(length=12),
            nullable=False,
            server_default="LEGACY",
        ),
    )

    op.create_check_constraint(
        "ck_transactions_category_source",
        "transactions",
        "category_source IN "
        "('LEGACY', 'AUTO', 'MANUAL', 'UNCLASSIFIED')",
    )


def downgrade():
    op.drop_constraint(
        "ck_transactions_category_source",
        "transactions",
        type_="check",
    )

    op.drop_column(
        "transactions",
        "category_source",
    )
