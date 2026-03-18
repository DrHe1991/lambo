"""Add exchange and quota tables

Revision ID: 002
Revises: 001
Create Date: 2024-01-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Exchange quotas table
    op.create_table(
        'pay_exchange_quotas',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('direction', sa.String(20), nullable=False, index=True),
        sa.Column('initial_amount', sa.BigInteger(), nullable=False),
        sa.Column('remaining_amount', sa.BigInteger(), nullable=False),
        sa.Column('btc_price_at_init', sa.Numeric(20, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
    )

    # Exchange previews table
    op.create_table(
        'pay_exchange_previews',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('wallet_id', sa.Integer(), sa.ForeignKey('pay_wallets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('direction', sa.String(20), nullable=False),
        sa.Column('amount_in', sa.BigInteger(), nullable=False),
        sa.Column('amount_out', sa.BigInteger(), nullable=False),
        sa.Column('btc_price', sa.Numeric(20, 2), nullable=False),
        sa.Column('buffer_rate', sa.Numeric(5, 4), default=0.005, nullable=False),
        sa.Column('bonus_sat', sa.BigInteger(), default=0, nullable=False),
        sa.Column('status', sa.String(20), default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
    )

    # Exchanges table (completed transactions)
    op.create_table(
        'pay_exchanges',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('wallet_id', sa.Integer(), sa.ForeignKey('pay_wallets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('preview_id', sa.String(36), nullable=False, index=True),
        sa.Column('direction', sa.String(20), nullable=False),
        sa.Column('amount_in', sa.BigInteger(), nullable=False),
        sa.Column('amount_out', sa.BigInteger(), nullable=False),
        sa.Column('btc_price', sa.Numeric(20, 2), nullable=False),
        sa.Column('buffer_fee', sa.BigInteger(), default=0, nullable=False),
        sa.Column('bonus_sat', sa.BigInteger(), default=0, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    # Rebalance logs table
    op.create_table(
        'pay_rebalance_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('trigger_type', sa.String(20), nullable=False),
        sa.Column('btc_before', sa.Numeric(20, 8), nullable=False),
        sa.Column('usdt_before', sa.Numeric(20, 2), nullable=False),
        sa.Column('btc_after', sa.Numeric(20, 8), nullable=False),
        sa.Column('usdt_after', sa.Numeric(20, 2), nullable=False),
        sa.Column('trade_direction', sa.String(10), nullable=True),
        sa.Column('trade_amount', sa.Numeric(20, 8), nullable=True),
        sa.Column('cex_order_id', sa.String(50), nullable=True),
        sa.Column('btc_price', sa.Numeric(20, 2), nullable=False),
        sa.Column('status', sa.String(20), default='completed', nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    # Reserve snapshots table
    op.create_table(
        'pay_reserve_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('btc_balance', sa.Numeric(20, 8), nullable=False),
        sa.Column('usdt_balance', sa.Numeric(20, 2), nullable=False),
        sa.Column('btc_price', sa.Numeric(20, 2), nullable=False),
        sa.Column('total_value_usd', sa.Numeric(20, 2), nullable=False),
        sa.Column('btc_ratio', sa.Numeric(5, 4), nullable=False),
        sa.Column('buy_sat_quota_remaining', sa.BigInteger(), default=0, nullable=False),
        sa.Column('sell_sat_quota_remaining', sa.BigInteger(), default=0, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, index=True),
    )

    # Add wallet_balances table if not exists
    op.create_table(
        'pay_wallet_balances',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('wallet_id', sa.Integer(), sa.ForeignKey('pay_wallets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('token_symbol', sa.String(20), nullable=False),
        sa.Column('token_contract', sa.String(100), nullable=True),
        sa.Column('balance', sa.BigInteger(), default=0, nullable=False),
        sa.Column('locked_balance', sa.BigInteger(), default=0, nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('wallet_id', 'token_symbol', name='uq_wallet_balance_token'),
    )


def downgrade() -> None:
    op.drop_table('pay_wallet_balances')
    op.drop_table('pay_reserve_snapshots')
    op.drop_table('pay_rebalance_logs')
    op.drop_table('pay_exchanges')
    op.drop_table('pay_exchange_previews')
    op.drop_table('pay_exchange_quotas')
