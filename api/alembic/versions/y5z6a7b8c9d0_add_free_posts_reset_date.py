"""Add free_posts_reset_date and update free_posts_remaining default to 3

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
Create Date: 2026-04-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'y5z6a7b8c9d0'
down_revision: Union[str, None] = 'x4y5z6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('free_posts_reset_date', sa.Date(), nullable=True),
    )
    # Update default for new users (existing rows will get reset on first post)
    op.alter_column(
        'users',
        'free_posts_remaining',
        server_default='3',
    )


def downgrade() -> None:
    op.alter_column(
        'users',
        'free_posts_remaining',
        server_default='1',
    )
    op.drop_column('users', 'free_posts_reset_date')
