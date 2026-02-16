"""add_challenges_table

Revision ID: a1b2c3d4e5f6
Revises: df6c5ea0bf11
Create Date: 2026-02-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'df6c5ea0bf11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'challenges',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('content_type', sa.String(10), nullable=False),
        sa.Column('content_id', sa.Integer(), nullable=False),
        sa.Column('challenger_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('author_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('reason', sa.String(30), nullable=False),
        sa.Column('layer', sa.Integer(), server_default='1', nullable=False),
        sa.Column('status', sa.String(20), server_default='pending', nullable=False),
        sa.Column('fee_paid', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('fine_amount', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('ai_verdict', sa.String(20), nullable=True),
        sa.Column('ai_reason', sa.Text(), nullable=True),
        sa.Column('ai_confidence', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_challenge_content', 'challenges', ['content_type', 'content_id'])
    op.create_index('ix_challenge_challenger', 'challenges', ['challenger_id'])
    op.create_index('ix_challenge_author', 'challenges', ['author_id'])
    op.create_index('ix_challenge_status', 'challenges', ['status'])


def downgrade() -> None:
    op.drop_index('ix_challenge_status', table_name='challenges')
    op.drop_index('ix_challenge_author', table_name='challenges')
    op.drop_index('ix_challenge_challenger', table_name='challenges')
    op.drop_index('ix_challenge_content', table_name='challenges')
    op.drop_table('challenges')
