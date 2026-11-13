"""add monthly budget limits

Revision ID: 54d3333cc103
Revises: f37c38bc237f
Create Date: 2026-11-05 23:52:00.097997

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '54d3333cc103'
down_revision = 'f37c38bc237f'
branch_labels = None
depends_on = None



def upgrade():
    op.create_table(
        "budget_monthly_limits",
        sa.Column(
            "id",
            sa.String(length=36),
            primary_key=True,
        ),
        sa.Column(
            "budget_id",
            sa.String(length=36),
            nullable=False,
        ),
        sa.Column(
            "month",
            sa.String(length=7),
            nullable=False,
        ),
        sa.Column(
            "monthly_limit",
            sa.Numeric(18, 2),
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
            ["budget_id"],
            ["budgets.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "budget_id",
            "month",
            name="uq_budget_monthly_limit",
        ),
        sa.CheckConstraint(
            "monthly_limit > 0",
            name="ck_budget_monthly_limits_positive",
        ),
    )

    op.create_index(
        "ix_budget_monthly_limits_budget_id",
        "budget_monthly_limits",
        ["budget_id"],
    )


def downgrade():
    op.drop_index(
        "ix_budget_monthly_limits_budget_id",
        table_name="budget_monthly_limits",
    )

    op.drop_table("budget_monthly_limits")
