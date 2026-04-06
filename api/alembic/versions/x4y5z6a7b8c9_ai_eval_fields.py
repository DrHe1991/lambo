"""Replace quality_score with quality+tags on posts, add interest_tags to users

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-04-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'x4y5z6a7b8c9'
down_revision: Union[str, None] = 'w3x4y5z6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('posts', 'quality_score')
    op.add_column('posts', sa.Column('quality', sa.String(20), nullable=True))
    op.add_column('posts', sa.Column('tags', sa.JSON(), nullable=True))
    op.add_column('users', sa.Column('interest_tags', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'interest_tags')
    op.drop_column('posts', 'tags')
    op.drop_column('posts', 'quality')
    op.add_column('posts', sa.Column('quality_score', sa.Integer(), nullable=True))
