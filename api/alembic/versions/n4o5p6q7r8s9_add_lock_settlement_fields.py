"""Add 24h lock settlement fields

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-03-05

Sprint: 24h lock settlement mechanism
- Adds status, locked_until, cost_paid, recipient_id to post_likes
- Adds status, locked_until, cost_paid, recipient_id to comment_likes
- Adds interaction_status, locked_until, recipient_id to comments
"""
from alembic import op
import sqlalchemy as sa


revision = 'n4o5p6q7r8s9'
down_revision = 'm3n4o5p6q7r8'
branch_labels = None
depends_on = None


def upgrade():
    # PostLike: add lock settlement fields
    op.add_column('post_likes', sa.Column(
        'status', sa.String(20), server_default='settled', nullable=False
    ))
    op.add_column('post_likes', sa.Column(
        'locked_until', sa.DateTime(), nullable=True
    ))
    op.add_column('post_likes', sa.Column(
        'cost_paid', sa.BigInteger(), server_default='0', nullable=False
    ))
    op.add_column('post_likes', sa.Column(
        'recipient_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True
    ))

    # CommentLike: add lock settlement fields
    op.add_column('comment_likes', sa.Column(
        'status', sa.String(20), server_default='settled', nullable=False
    ))
    op.add_column('comment_likes', sa.Column(
        'locked_until', sa.DateTime(), nullable=True
    ))
    op.add_column('comment_likes', sa.Column(
        'cost_paid', sa.BigInteger(), server_default='0', nullable=False
    ))
    op.add_column('comment_likes', sa.Column(
        'recipient_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True
    ))

    # Comment: add lock settlement fields (already has cost_paid)
    op.add_column('comments', sa.Column(
        'interaction_status', sa.String(20), server_default='settled', nullable=False
    ))
    op.add_column('comments', sa.Column(
        'locked_until', sa.DateTime(), nullable=True
    ))
    op.add_column('comments', sa.Column(
        'recipient_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True
    ))

    # Partial indexes for efficient settlement queries
    op.create_index(
        'ix_post_likes_pending',
        'post_likes',
        ['status', 'locked_until'],
        postgresql_where=sa.text("status = 'pending'")
    )
    op.create_index(
        'ix_comment_likes_pending',
        'comment_likes',
        ['status', 'locked_until'],
        postgresql_where=sa.text("status = 'pending'")
    )
    op.create_index(
        'ix_comments_pending',
        'comments',
        ['interaction_status', 'locked_until'],
        postgresql_where=sa.text("interaction_status = 'pending'")
    )


def downgrade():
    # Drop indexes
    op.drop_index('ix_comments_pending', table_name='comments')
    op.drop_index('ix_comment_likes_pending', table_name='comment_likes')
    op.drop_index('ix_post_likes_pending', table_name='post_likes')

    # Drop columns from comments
    op.drop_column('comments', 'recipient_id')
    op.drop_column('comments', 'locked_until')
    op.drop_column('comments', 'interaction_status')

    # Drop columns from comment_likes
    op.drop_column('comment_likes', 'recipient_id')
    op.drop_column('comment_likes', 'cost_paid')
    op.drop_column('comment_likes', 'locked_until')
    op.drop_column('comment_likes', 'status')

    # Drop columns from post_likes
    op.drop_column('post_likes', 'recipient_id')
    op.drop_column('post_likes', 'cost_paid')
    op.drop_column('post_likes', 'locked_until')
    op.drop_column('post_likes', 'status')
