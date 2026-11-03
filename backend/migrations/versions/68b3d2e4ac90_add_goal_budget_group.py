"""Add Needs, Wants, Savings group to savings goals.

Revision ID: 68b3d2e4ac90
Revises: 0fae48412e64
"""
from alembic import op
import sqlalchemy as sa

revision = "68b3d2e4ac90"
down_revision = "0fae48412e64"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("savings_goals") as batch_op:
        batch_op.add_column(
            sa.Column(
                "budget_group",
                sa.String(length=16),
                nullable=False,
                server_default="Savings",
            )
        )
        batch_op.create_check_constraint(
            "ck_savings_goals_budget_group",
            "budget_group IN ('Needs', 'Wants', 'Savings')",
        )


def downgrade():
    with op.batch_alter_table("savings_goals") as batch_op:
        batch_op.drop_constraint(
            "ck_savings_goals_budget_group",
            type_="check",
        )
        batch_op.drop_column("budget_group")
