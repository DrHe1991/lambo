"""Add boost columns to posts

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-02-28

Sprint 12: Boost paid promotion
"""
from alembic import op
import sqlalchemy as sa


revision = 'm3n4o5p6q7r8'
down_revision = 'l2m3n4o5p6q7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('posts', sa.Column('boost_amount', sa.BigInteger(), server_default='0'))
    op.add_column('posts', sa.Column('boost_remaining', sa.Float(), server_default='0.0'))


def downgrade():
    op.drop_column('posts', 'boost_remaining')
    op.drop_column('posts', 'boost_amount')
