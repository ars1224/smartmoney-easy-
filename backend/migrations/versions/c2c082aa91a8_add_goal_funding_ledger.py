"""Add goal funding ledger and preserve legacy goal balances.

Revision ID: c2c082aa91a8
Revises: 545d669fced4
"""

from alembic import op
import sqlalchemy as sa


revision = "c2c082aa91a8"
down_revision = "545d669fced4"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Create the source-specific funding ledger.
    op.create_table(
        "goal_funding_movements",

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
            "goal_id",
            sa.String(length=36),
            nullable=False,
        ),

        sa.Column(
            "bank_account_id",
            sa.String(length=36),
            nullable=True,
        ),

        sa.Column(
            "cash_wallet_id",
            sa.String(length=36),
            nullable=True,
        ),

        sa.Column(
            "amount",
            sa.Numeric(14, 2),
            nullable=False,
        ),

        sa.Column(
            "request_id",
            sa.String(length=36),
            nullable=False,
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),

        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),

        sa.ForeignKeyConstraint(
            ["goal_id"],
            ["savings_goals.id"],
            ondelete="RESTRICT",
        ),

        sa.ForeignKeyConstraint(
            ["bank_account_id"],
            ["bank_accounts.id"],
            ondelete="RESTRICT",
        ),

        sa.ForeignKeyConstraint(
            ["cash_wallet_id"],
            ["cash_wallets.id"],
            ondelete="RESTRICT",
        ),

        sa.CheckConstraint(
            "amount <> 0",
            name="ck_goal_funding_amount_nonzero",
        ),

        sa.CheckConstraint(
            "("
            "bank_account_id IS NOT NULL "
            "AND cash_wallet_id IS NULL"
            ") OR ("
            "bank_account_id IS NULL "
            "AND cash_wallet_id IS NOT NULL"
            ")",
            name="ck_goal_funding_exactly_one_source",
        ),

        sa.UniqueConstraint(
            "user_id",
            "request_id",
            name="uq_goal_funding_request",
        ),
    )

    # 2. Add indexes for allocation queries.
    for column_name in (
        "bank_account_id",
        "cash_wallet_id",
        "goal_id",
        "user_id",
    ):
        op.create_index(
            f"ix_goal_funding_movements_{column_name}",
            "goal_funding_movements",
            [column_name],
        )

    # 3. Preserve manually entered goal balances.
    op.add_column(
        "savings_goals",
        sa.Column(
            "legacy_unverified_amount",
            sa.Numeric(14, 2),
            nullable=False,
            server_default="0.00",
        ),
    )

    op.create_check_constraint(
        "ck_savings_goals_legacy_nonnegative",
        "savings_goals",
        "legacy_unverified_amount >= 0",
    )

    # 4. Preserve existing saved amounts separately.
    #
    # After this migration:
    # - saved_amount represents verified allocations.
    # - legacy_unverified_amount retains old manual savings.
    #
    # No historical goal money is deleted.
    op.execute(
        sa.text(
            """
            UPDATE savings_goals
            SET
                legacy_unverified_amount = saved_amount,
                saved_amount = 0.00
            WHERE saved_amount <> 0
            """
        )
    )


def downgrade():
    connection = op.get_bind()

    # Never silently discard financial allocation history.
    has_movements = connection.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM goal_funding_movements
            )
            """
        )
    ).scalar()

    if has_movements:
        raise RuntimeError(
            "Cannot downgrade: goal funding movements exist. "
            "Export and reconcile the funding history first."
        )

    # Restore legacy saved amounts before removing the column.
    op.execute(
        sa.text(
            """
            UPDATE savings_goals
            SET saved_amount = (
                saved_amount + legacy_unverified_amount
            )
            """
        )
    )

    op.drop_constraint(
        "ck_savings_goals_legacy_nonnegative",
        "savings_goals",
        type_="check",
    )

    op.drop_column(
        "savings_goals",
        "legacy_unverified_amount",
    )

    # Remove ledger indexes before removing the empty table.
    for column_name in (
        "user_id",
        "goal_id",
        "cash_wallet_id",
        "bank_account_id",
    ):
        op.drop_index(
            f"ix_goal_funding_movements_{column_name}",
            table_name="goal_funding_movements",
        )

    op.drop_table("goal_funding_movements")