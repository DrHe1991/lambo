"""add platform_revenue table

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-02-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i9j0k1l2m3n4'
down_revision: Union[str, None] = 'h8i9j0k1l2m3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'platform_revenue',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('like_revenue', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('comment_revenue', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('post_revenue', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('boost_revenue', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('total', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('distributed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('distributed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_platform_revenue_date', 'platform_revenue', ['date'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_platform_revenue_date', 'platform_revenue')
    op.drop_table('platform_revenue')
