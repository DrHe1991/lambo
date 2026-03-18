"""Add stable_balance and first exchange bonus fields

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-03-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 's9t0u1v2w3x4'
down_revision: Union[str, None] = 'r8s9t0u1v2w3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add stable balance (USDT, 6 decimals)
    op.add_column('users', sa.Column('stable_balance', sa.BigInteger(), nullable=False, server_default='0'))
    
    # Add first exchange bonus tracking
    op.add_column('users', sa.Column('first_deposit_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('first_exchange_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('welcome_bonus_claimed', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('users', 'welcome_bonus_claimed')
    op.drop_column('users', 'first_exchange_at')
    op.drop_column('users', 'first_deposit_at')
    op.drop_column('users', 'stable_balance')
