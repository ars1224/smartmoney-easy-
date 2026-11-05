"""reconcile budgets and main migration history

Revision ID: f37c38bc237f
Revises: 411154e5f501, b517f6add292
Create Date: 2026-11-05 00:15:22.245327

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f37c38bc237f'
down_revision = ('411154e5f501', 'b517f6add292')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
