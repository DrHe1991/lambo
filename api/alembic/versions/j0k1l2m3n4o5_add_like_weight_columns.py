"""Add like weight columns to post_likes table

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-02-28

Sprint 9: Full Like Weight implementation
"""
from alembic import op
import sqlalchemy as sa


revision = 'j0k1l2m3n4o5'
down_revision = 'i9j0k1l2m3n4'
branch_labels = None
depends_on = None


def upgrade():
    # Add weight component columns to post_likes
    op.add_column('post_likes', sa.Column('w_trust', sa.Float(), nullable=True, server_default='1.0'))
    op.add_column('post_likes', sa.Column('n_novelty', sa.Float(), nullable=True, server_default='1.0'))
    op.add_column('post_likes', sa.Column('s_source', sa.Float(), nullable=True, server_default='1.0'))
    op.add_column('post_likes', sa.Column('ce_entropy', sa.Float(), nullable=True, server_default='1.0'))
    op.add_column('post_likes', sa.Column('cross_circle', sa.Float(), nullable=True, server_default='1.0'))
    op.add_column('post_likes', sa.Column('cabal_penalty', sa.Float(), nullable=True, server_default='1.0'))
    op.add_column('post_likes', sa.Column('total_weight', sa.Float(), nullable=True, server_default='1.0'))
    op.add_column('post_likes', sa.Column('is_cross_circle', sa.Boolean(), nullable=True, server_default='false'))


def downgrade():
    op.drop_column('post_likes', 'is_cross_circle')
    op.drop_column('post_likes', 'total_weight')
    op.drop_column('post_likes', 'cabal_penalty')
    op.drop_column('post_likes', 'cross_circle')
    op.drop_column('post_likes', 'ce_entropy')
    op.drop_column('post_likes', 's_source')
    op.drop_column('post_likes', 'n_novelty')
    op.drop_column('post_likes', 'w_trust')
