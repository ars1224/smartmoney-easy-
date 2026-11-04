"""reconcile cash wallet and main migration heads

Revision ID: b517f6add292
Revises: 0fae48412e64, f024227efd4b
Create Date: 2026-11-03 22:31:29.458376

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b517f6add292'
down_revision = ('0fae48412e64', 'f024227efd4b')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
