
"""Add user onboarding progress.

Revision ID: a6d0bc37e942
Revises: bc62f914d8ae
"""

from alembic import op
import sqlalchemy as sa


revision = "a6d0bc37e942"
down_revision = "bc62f914d8ae"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_onboarding_progress",
        sa.Column(
            "user_id",
            sa.String(length=36),
            primary_key=True,
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
        ),
        sa.Column(
            "current_step",
            sa.String(length=30),
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
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "status IN ('IN_PROGRESS', 'COMPLETED')",
            name="ck_onboarding_status",
        ),
        sa.CheckConstraint(
            """
            current_step IN (
                'EMPLOYMENT',
                'PAYROLL',
                'BUDGET',
                'REVIEW'
            )
            """,
            name="ck_onboarding_step",
        ),
    )


def downgrade():
    op.drop_table("user_onboarding_progress")
