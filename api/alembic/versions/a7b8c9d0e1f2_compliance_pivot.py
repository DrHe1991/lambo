"""Compliance pivot: drop SAT economy, add Privy wallet linkage.

Single breaking migration that removes the like-to-earn / dynamic pricing /
revenue pool columns and tables, and adds non-custodial wallet columns.

Posts/comments/follows/chat/drafts/media data is preserved.
All money state (balances, ledger, pay_*, platform_revenue, interaction_log)
is dropped and recreated minimal.

See plan: bitlink-apple-compliance-pivot_ef942d16.plan.md §5.5

Revision ID: a7b8c9d0e1f2
Revises: z6a7b8c9d0e1
Create Date: 2026-04-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'z6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_col_if_exists(table: str, col: str) -> None:
    bind = op.get_bind()
    res = bind.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {'t': table, 'c': col}).first()
    if res is not None:
        op.drop_column(table, col)


def _drop_table_if_exists(table: str) -> None:
    op.execute(sa.text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))


def upgrade() -> None:
    # 1. Drop pay_* tables (entire pay/ microservice schema)
    for t in (
        'pay_exchange_orders',
        'pay_withdrawals',
        'pay_deposits',
        'pay_wallets',
        'pay_addresses',
        'pay_apps',
        'pay_ledger',
        'pay_reserves',
        'pay_reserve_snapshots',
    ):
        _drop_table_if_exists(t)

    # 2. Drop platform_revenue + interaction_log + cabal/challenge tables
    _drop_table_if_exists('platform_revenue')
    _drop_table_if_exists('interaction_log')
    _drop_table_if_exists('cabal_members')
    _drop_table_if_exists('cabals')
    _drop_table_if_exists('challenge_jurors')
    _drop_table_if_exists('challenges')

    # 3. Users — drop money columns, add wallet columns
    for col in (
        'available_balance', 'stable_balance', 'pay_wallet_id',
        'welcome_bonus_claimed', 'first_exchange_at', 'first_deposit_at',
    ):
        _drop_col_if_exists('users', col)

    op.add_column('users', sa.Column('privy_user_id', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('embedded_wallet_address', sa.String(42), nullable=True))
    op.add_column('users', sa.Column('delegated_actions_enabled_at', sa.DateTime(), nullable=True))
    op.create_unique_constraint('uq_users_privy_user_id', 'users', ['privy_user_id'])
    op.create_unique_constraint('uq_users_embedded_wallet_address', 'users', ['embedded_wallet_address'])
    op.create_index('ix_users_privy_user_id', 'users', ['privy_user_id'])
    op.create_index('ix_users_embedded_wallet_address', 'users', ['embedded_wallet_address'])

    # 4. Posts — drop economic columns, add tip aggregates
    for col in ('revenue_pool', 'cost_paid', 'boost_amount', 'boost_remaining'):
        _drop_col_if_exists('posts', col)
    op.add_column('posts', sa.Column('tip_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('posts', sa.Column('tip_total_usdc_micro', sa.BigInteger(), nullable=False, server_default='0'))
    # bounty: int -> bigint (micro-USDC granularity)
    op.alter_column('posts', 'bounty', type_=sa.BigInteger(), existing_nullable=True)

    # 5. Comments — drop economic + lock fields, add deleted flag
    for col in (
        'revenue_pool', 'cost_paid', 'interaction_status', 'locked_until', 'recipient_id',
    ):
        _drop_col_if_exists('comments', col)
    op.add_column('comments', sa.Column('deleted', sa.Boolean(), nullable=False, server_default='false'))

    # 6. PostLikes — drop weight/lock/economic fields, add tx fields
    for col in (
        'w_trust', 'n_novelty', 's_source', 'ce_entropy', 'cross_circle',
        'cabal_penalty', 'total_weight', 'is_cross_circle', 'earnings',
        'status', 'locked_until', 'cost_paid', 'recipient_id',
    ):
        _drop_col_if_exists('post_likes', col)
    op.add_column('post_likes', sa.Column('tx_hash', sa.String(66), nullable=True))
    op.add_column('post_likes', sa.Column('amount_usdc_micro', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('post_likes', sa.Column('confirmed_at', sa.DateTime(), nullable=True))
    op.create_unique_constraint('uq_post_likes_tx_hash', 'post_likes', ['tx_hash'])

    # 7. CommentLikes — drop economic + lock fields
    for col in ('status', 'locked_until', 'cost_paid', 'recipient_id'):
        _drop_col_if_exists('comment_likes', col)

    # 8. Ledger — recreate with simplified schema (data wipe)
    _drop_table_if_exists('ledger')
    op.create_table(
        'ledger',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('amount_usdc_micro', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('action_type', sa.String(30), nullable=False),
        sa.Column('ref_type', sa.String(20), nullable=False, server_default='none'),
        sa.Column('ref_id', sa.BigInteger(), nullable=True),
        sa.Column('tx_hash', sa.String(66), nullable=True),
        sa.Column('note', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Index('ix_ledger_user_created', 'user_id', 'created_at'),
    )


def downgrade() -> None:
    """No-op. This is a one-way breaking migration; restore from archive/like-to-earn-v1 if needed."""
    raise NotImplementedError(
        'Downgrade not supported. To revert, check out branch archive/like-to-earn-v1.'
    )
