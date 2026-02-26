"""add join requests table

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-02-22 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h8i9j0k1l2m3'
down_revision: Union[str, None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'join_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invite_code', sa.String(20), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    # Index for efficient queries
    op.create_index('ix_join_requests_session_status', 'join_requests', ['session_id', 'status'])


def downgrade() -> None:
    op.drop_index('ix_join_requests_session_status', 'join_requests')
    op.drop_table('join_requests')
