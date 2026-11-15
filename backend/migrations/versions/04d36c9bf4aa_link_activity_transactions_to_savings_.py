"""link activity transactions to savings goals

Revision ID: 04d36c9bf4aa
Revises: c2c082aa91a8
Create Date: 2026-11-15 17:20:43.910482
"""

from alembic import op
import sqlalchemy as sa


# Revision identifiers
revision = "04d36c9bf4aa"
down_revision = "c2c082aa91a8"
branch_labels = None
depends_on = None


def upgrade():
    # Record when a savings goal is achieved.
    with op.batch_alter_table("savings_goals") as batch_op:
        batch_op.add_column(
            sa.Column(
                "achieved_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )

    # Link an existing Activity transaction to a savings goal.
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "goal_id",
                sa.String(length=36),
                nullable=True,
            )
        )

        batch_op.create_index(
            "ix_transactions_goal_id",
            ["goal_id"],
            unique=False,
        )

        batch_op.create_foreign_key(
            "fk_transactions_goal_id_savings_goals",
            "savings_goals",
            ["goal_id"],
            ["id"],
            ondelete="RESTRICT",
        )


def downgrade():
    # Remove the Activity-to-Goal relationship.
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_constraint(
            "fk_transactions_goal_id_savings_goals",
            type_="foreignkey",
        )

        batch_op.drop_index("ix_transactions_goal_id")

        batch_op.drop_column("goal_id")

    # Remove the achievement timestamp.
    with op.batch_alter_table("savings_goals") as batch_op:
        batch_op.drop_column("achieved_at")