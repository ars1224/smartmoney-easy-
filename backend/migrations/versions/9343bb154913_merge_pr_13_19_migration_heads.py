"""merge PR 13-19 migration heads

Revision ID: 9343bb154913
Revises: 0fae48412e64, 411154e5f501
Create Date: 2026-11-02 01:27:12.567270

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9343bb154913'
down_revision = ('0fae48412e64', '411154e5f501')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
