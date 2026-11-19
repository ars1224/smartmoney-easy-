"""track user credential changes

Revision ID: 66b1c47ad455
Revises: c66ee6893773
Create Date: 2026-11-18 20:04:43.672149

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '66b1c47ad455'
down_revision = 'c66ee6893773'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "credentials_changed_at",
            sa.DateTime(timezone=True),
            nullable=True
        )
    )


def downgrade():
    op.drop_column(
        "users",
        "credentials_changed_at"
    )