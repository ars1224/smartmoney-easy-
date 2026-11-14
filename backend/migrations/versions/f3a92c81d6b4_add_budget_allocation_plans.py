
"""Add monthly budget allocation plans.

Revision ID: f3a92c81d6b4
Revises: e7c19ad245b0
"""

from alembic import op
import sqlalchemy as sa


revision = "f3a92c81d6b4"
down_revision = "e7c19ad245b0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "budget_allocation_plans",
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
            "month",
            sa.String(length=7),
            nullable=False,
        ),
        sa.Column(
            "needs_percent",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "savings_percent",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "wants_percent",
            sa.Integer(),
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
        sa.UniqueConstraint(
            "user_id",
            "month",
            name="uq_budget_allocation_user_month",
        ),
        sa.CheckConstraint(
            "needs_percent BETWEEN 0 AND 100",
            name="ck_budget_allocation_needs",
        ),
        sa.CheckConstraint(
            "savings_percent BETWEEN 0 AND 100",
            name="ck_budget_allocation_savings",
        ),
        sa.CheckConstraint(
            "wants_percent BETWEEN 0 AND 100",
            name="ck_budget_allocation_wants",
        ),
        sa.CheckConstraint(
            """
            needs_percent
            + savings_percent
            + wants_percent = 100
            """,
            name="ck_budget_allocation_total",
        ),
    )

    op.create_index(
        "ix_budget_allocation_plans_user_id",
        "budget_allocation_plans",
        ["user_id"],
    )


def downgrade():
    op.drop_index(
        "ix_budget_allocation_plans_user_id",
        table_name="budget_allocation_plans",
    )

    op.drop_table("budget_allocation_plans")
