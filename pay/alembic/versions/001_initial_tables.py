"""Initial tables for pay service

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Apps table
    op.create_table(
        'pay_apps',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), unique=True, nullable=False, index=True),
        sa.Column('api_key', sa.String(64), unique=True, nullable=False, index=True),
        sa.Column('api_secret_hash', sa.String(128), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('webhook_url', sa.String(500), nullable=True),
        sa.Column('webhook_secret', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # Wallets table
    op.create_table(
        'pay_wallets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('app_id', sa.Integer(), sa.ForeignKey('pay_apps.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('external_user_id', sa.String(100), nullable=False, index=True),
        sa.Column('balance', sa.BigInteger(), default=0, nullable=False),
        sa.Column('locked_balance', sa.BigInteger(), default=0, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('app_id', 'external_user_id', name='uq_wallet_app_user'),
    )

    # Deposit addresses table
    op.create_table(
        'pay_deposit_addresses',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('wallet_id', sa.Integer(), sa.ForeignKey('pay_wallets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('chain', sa.String(20), nullable=False, index=True),
        sa.Column('address', sa.String(100), nullable=False, index=True),
        sa.Column('derivation_index', sa.Integer(), nullable=False),
        sa.Column('last_scanned_block', sa.BigInteger(), default=0, nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('chain', 'address', name='uq_deposit_address_chain_addr'),
        sa.UniqueConstraint('chain', 'derivation_index', name='uq_deposit_address_chain_index'),
    )

    # Deposits table
    op.create_table(
        'pay_deposits',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('wallet_id', sa.Integer(), sa.ForeignKey('pay_wallets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('deposit_address_id', sa.Integer(), sa.ForeignKey('pay_deposit_addresses.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('chain', sa.String(20), nullable=False, index=True),
        sa.Column('tx_hash', sa.String(100), nullable=False, index=True),
        sa.Column('block_number', sa.BigInteger(), nullable=False),
        sa.Column('token_contract', sa.String(100), nullable=True),
        sa.Column('token_symbol', sa.String(20), default='TRX', nullable=False),
        sa.Column('amount', sa.BigInteger(), nullable=False),
        sa.Column('from_address', sa.String(100), nullable=False),
        sa.Column('confirmations', sa.Integer(), default=0, nullable=False),
        sa.Column('required_confirmations', sa.Integer(), default=20, nullable=False),
        sa.Column('status', sa.String(20), default='pending', nullable=False, index=True),
        sa.Column('credited_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('chain', 'tx_hash', name='uq_deposit_chain_tx'),
    )

    # Withdrawals table
    op.create_table(
        'pay_withdrawals',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('wallet_id', sa.Integer(), sa.ForeignKey('pay_wallets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('chain', sa.String(20), nullable=False, index=True),
        sa.Column('to_address', sa.String(100), nullable=False),
        sa.Column('token_contract', sa.String(100), nullable=True),
        sa.Column('token_symbol', sa.String(20), default='TRX', nullable=False),
        sa.Column('amount', sa.BigInteger(), nullable=False),
        sa.Column('fee', sa.BigInteger(), default=0, nullable=False),
        sa.Column('status', sa.String(20), default='pending', nullable=False, index=True),
        sa.Column('tx_hash', sa.String(100), nullable=True, index=True),
        sa.Column('block_number', sa.BigInteger(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
        sa.Column('confirmed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # Ledger table
    op.create_table(
        'pay_ledger',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('wallet_id', sa.Integer(), sa.ForeignKey('pay_wallets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('amount', sa.BigInteger(), nullable=False),
        sa.Column('balance_after', sa.BigInteger(), nullable=False),
        sa.Column('action', sa.String(30), nullable=False, index=True),
        sa.Column('ref_type', sa.String(20), nullable=True),
        sa.Column('ref_id', sa.Integer(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table('pay_ledger')
    op.drop_table('pay_withdrawals')
    op.drop_table('pay_deposits')
    op.drop_table('pay_deposit_addresses')
    op.drop_table('pay_wallets')
    op.drop_table('pay_apps')
