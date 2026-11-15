"""track goal funded purchases

Revision ID: cac378317166
Revises: 04d36c9bf4aa
Create Date: 2026-11-15 18:25:33.731146

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cac378317166'
down_revision = '04d36c9bf4aa'
branch_labels = None
depends_on = None


def upgrade():
    # Associate a goal funding movement with an Activity purchase.
    op.add_column(
        "goal_funding_movements",
        sa.Column(
            "transaction_id",
            sa.String(length=36),
            nullable=True,
        ),
    )

    # Preserve the relationship with the original transaction.
    op.create_foreign_key(
        "fk_goal_funding_movements_transaction_id",
        "goal_funding_movements",
        "transactions",
        ["transaction_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # A purchase can settle goal funding only once.
    op.create_unique_constraint(
        "uq_goal_funding_transaction",
        "goal_funding_movements",
        ["transaction_id"],
    )

    # Purchase-linked movements must reduce reserved funds.
    op.create_check_constraint(
        "ck_goal_funding_spent_negative",
        "goal_funding_movements",
        "transaction_id IS NULL OR amount < 0",
    )


def downgrade():
    op.drop_constraint(
        "ck_goal_funding_spent_negative",
        "goal_funding_movements",
        type_="check",
    )

    op.drop_constraint(
        "uq_goal_funding_transaction",
        "goal_funding_movements",
        type_="unique",
    )

    op.drop_constraint(
        "fk_goal_funding_movements_transaction_id",
        "goal_funding_movements",
        type_="foreignkey",
    )

    op.drop_column(
        "goal_funding_movements",
        "transaction_id",
    )
