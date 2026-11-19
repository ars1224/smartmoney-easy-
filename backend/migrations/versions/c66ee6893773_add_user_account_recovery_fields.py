"""add user account recovery fields

Revision ID: c66ee6893773
Revises: cac378317166
Create Date: 2026-11-18 18:26:19.994274

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c66ee6893773'
down_revision = 'cac378317166'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "recovery_code_hash",
            sa.String(length=255),
            nullable=True
        )
    )

    op.add_column(
        "users",
        sa.Column(
            "recovery_failed_attempts",
            sa.Integer(),
            server_default="0",
            nullable=False
        )
    )

    op.add_column(
        "users",
        sa.Column(
            "recovery_locked_until",
            sa.DateTime(timezone=True),
            nullable=True
        )
    )

def downgrade():
    op.drop_column(
        "users",
        "recovery_locked_until"
    )

    op.drop_column(
        "users",
        "recovery_failed_attempts"
    )

    op.drop_column(
        "users",
        "recovery_code_hash"
    )