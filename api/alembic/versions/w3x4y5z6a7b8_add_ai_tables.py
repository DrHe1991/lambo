"""Add AI usage tracking, reports, and post AI columns

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-04-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'w3x4y5z6a7b8'
down_revision: Union[str, None] = 'v2w3x4y5z6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # AI usage tracking
    op.create_table(
        'ai_usage',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('feature', sa.String(50), nullable=False),
        sa.Column('model', sa.String(50), nullable=False),
        sa.Column('input_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('output_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('estimated_cost_usd', sa.Float(), nullable=False, server_default='0'),
        sa.Column('ref_type', sa.String(20), nullable=True),
        sa.Column('ref_id', sa.BigInteger(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ai_usage_feature', 'ai_usage', ['feature'])
    op.create_index('ix_ai_usage_created_at', 'ai_usage', ['created_at'])

    # Reports table
    op.create_table(
        'reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('reporter_id', sa.Integer(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('verdict', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='0'),
        sa.Column('ai_reason', sa.Text(), nullable=False, server_default=''),
        sa.Column('action_taken', sa.String(50), nullable=False, server_default='none'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_reports_post_id', 'reports', ['post_id'])
    op.create_index('ix_reports_reporter_id', 'reports', ['reporter_id'])

    # Post AI columns
    op.add_column('posts', sa.Column('quality_score', sa.Integer(), nullable=True))
    op.add_column('posts', sa.Column('ai_summary', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('posts', 'ai_summary')
    op.drop_column('posts', 'quality_score')
    op.drop_index('ix_reports_reporter_id', 'reports')
    op.drop_index('ix_reports_post_id', 'reports')
    op.drop_table('reports')
    op.drop_index('ix_ai_usage_created_at', 'ai_usage')
    op.drop_index('ix_ai_usage_feature', 'ai_usage')
    op.drop_table('ai_usage')
