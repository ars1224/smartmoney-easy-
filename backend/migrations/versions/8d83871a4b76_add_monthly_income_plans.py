"""add monthly income plans

Revision ID: 8d83871a4b76
Revises: 54d3333cc103
Create Date: 2026-11-06 18:45:50.732217

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8d83871a4b76'
down_revision = '54d3333cc103'
branch_labels = None
depends_on = None



def upgrade():
    op.create_table(
        "monthly_income_plans",
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
            "expected_income",
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
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "user_id",
            "month",
            name="uq_monthly_income_plan_user_month",
        ),
        sa.CheckConstraint(
            "expected_income >= 0",
            name="ck_monthly_income_expected_nonnegative",
        ),
    )

    op.create_index(
        "ix_monthly_income_plans_user_id",
        "monthly_income_plans",
        ["user_id"],
    )


def downgrade():
    op.drop_index(
        "ix_monthly_income_plans_user_id",
        table_name="monthly_income_plans",
    )

    op.drop_table("monthly_income_plans")