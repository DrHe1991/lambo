"""Add revenue_pool to posts and comments for pool-based liker earnings

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
Create Date: 2026-04-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'z6a7b8c9d0e1'
down_revision: Union[str, None] = 'y5z6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'posts',
        sa.Column('revenue_pool', sa.BigInteger(), nullable=False, server_default='0'),
    )
    op.add_column(
        'comments',
        sa.Column('revenue_pool', sa.BigInteger(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('comments', 'revenue_pool')
    op.drop_column('posts', 'revenue_pool')
