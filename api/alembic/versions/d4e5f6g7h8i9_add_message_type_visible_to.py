"""Add message_type and visible_to to messages

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-02-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6g7h8i9'
down_revision: Union[str, None] = 'c3d4e5f6g7h8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'messages',
        sa.Column('message_type', sa.String(20), nullable=False, server_default='text')
    )
    op.add_column(
        'messages',
        sa.Column('visible_to', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('messages', 'visible_to')
    op.drop_column('messages', 'message_type')
