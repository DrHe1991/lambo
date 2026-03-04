"""Add cabal detection tables

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-02-28

Sprint 10: Cabal Detection & Penalties
"""
from alembic import op
import sqlalchemy as sa


revision = 'k1l2m3n4o5p6'
down_revision = 'j0k1l2m3n4o5'
branch_labels = None
depends_on = None


def upgrade():
    # Create cabal_groups table
    op.create_table(
        'cabal_groups',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='suspected'),
        sa.Column('internal_ratio', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('avg_internal_interactions', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('member_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('total_confiscated', sa.BigInteger(), nullable=True, server_default='0'),
        sa.Column('penalty_expires_at', sa.DateTime(), nullable=True),
        sa.Column('detection_notes', sa.Text(), nullable=True),
        sa.Column('detected_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('confirmed_at', sa.DateTime(), nullable=True),
    )

    # Create cabal_members table
    op.create_table(
        'cabal_members',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('group_id', sa.Integer(), sa.ForeignKey('cabal_groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('is_leader', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('internal_interactions', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('external_interactions', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('risk_added', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('creator_deducted', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('balance_confiscated', sa.BigInteger(), nullable=True, server_default='0'),
        sa.Column('added_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('penalized_at', sa.DateTime(), nullable=True),
    )

    # Create index for efficient lookups
    op.create_index('ix_cabal_members_user_id', 'cabal_members', ['user_id'])
    op.create_index('ix_cabal_groups_status', 'cabal_groups', ['status'])


def downgrade():
    op.drop_index('ix_cabal_groups_status')
    op.drop_index('ix_cabal_members_user_id')
    op.drop_table('cabal_members')
    op.drop_table('cabal_groups')
