"""Add initiated_by to chat_sessions

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6g7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'chat_sessions',
        sa.Column('initiated_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('chat_sessions', 'initiated_by')
