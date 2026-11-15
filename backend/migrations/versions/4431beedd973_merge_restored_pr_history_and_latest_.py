"""merge restored PR history and latest budget migrations

Revision ID: 4431beedd973
Revises: 9343bb154913, 545d669fced4
Create Date: 2026-11-15 22:54:50.956662

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4431beedd973'
down_revision = ('9343bb154913', '545d669fced4')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
