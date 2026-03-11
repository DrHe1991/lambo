"""Minimal system migration - add earnings field to post_likes

This migration is part of the minimal system refactoring.
The minimal system focuses on:
- Dynamic like pricing (cost = max(5, 100/sqrt(1+likes)))
- Early supporter revenue sharing (50% author, 40% early likers, 10% platform)
- Free posting

Removed features (services still exist in code but unused):
- Complex trust score calculations
- Cabal detection
- Challenge/jury system
- Boost (paid promotion)
- Discovery score
- Quality subsidy

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-03-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'p6q7r8s9t0u1'
down_revision: Union[str, None] = 'o5p6q7r8s9t0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add earnings column to post_likes to track total earnings from revenue sharing
    op.add_column('post_likes', sa.Column(
        'earnings',
        sa.BigInteger(),
        nullable=False,
        server_default='0',
        comment='Total earnings from early supporter revenue sharing'
    ))


def downgrade() -> None:
    op.drop_column('post_likes', 'earnings')
