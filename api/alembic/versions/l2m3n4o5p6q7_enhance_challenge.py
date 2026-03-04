"""Enhance challenge for L2/L3 + add jury_votes table

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-02-28

Sprint 11: Challenge/Report System Enhancement
"""
from alembic import op
import sqlalchemy as sa


revision = 'l2m3n4o5p6q7'
down_revision = 'k1l2m3n4o5p6'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to challenges table
    op.add_column('challenges', sa.Column('violation_type', sa.String(20), nullable=True))
    op.add_column('challenges', sa.Column('reporter_reward', sa.BigInteger(), server_default='0'))
    op.add_column('challenges', sa.Column('jury_reward', sa.BigInteger(), server_default='0'))
    op.add_column('challenges', sa.Column('platform_share', sa.BigInteger(), server_default='0'))
    op.add_column('challenges', sa.Column('votes_guilty', sa.Integer(), server_default='0'))
    op.add_column('challenges', sa.Column('votes_not_guilty', sa.Integer(), server_default='0'))
    op.add_column('challenges', sa.Column('jury_size', sa.Integer(), server_default='5'))
    op.add_column('challenges', sa.Column('voting_deadline', sa.DateTime(), nullable=True))

    # Create jury_votes table
    op.create_table(
        'jury_votes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('challenge_id', sa.Integer(), sa.ForeignKey('challenges.id', ondelete='CASCADE'), nullable=False),
        sa.Column('juror_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('vote_guilty', sa.Boolean(), nullable=False),
        sa.Column('reasoning', sa.Text(), nullable=True),
        sa.Column('reward_amount', sa.BigInteger(), server_default='0'),
        sa.Column('voted_with_majority', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_index('ix_jury_vote_challenge', 'jury_votes', ['challenge_id'])
    op.create_index('ix_jury_vote_juror', 'jury_votes', ['juror_id'])


def downgrade():
    op.drop_index('ix_jury_vote_juror')
    op.drop_index('ix_jury_vote_challenge')
    op.drop_table('jury_votes')
    
    op.drop_column('challenges', 'voting_deadline')
    op.drop_column('challenges', 'jury_size')
    op.drop_column('challenges', 'votes_not_guilty')
    op.drop_column('challenges', 'votes_guilty')
    op.drop_column('challenges', 'platform_share')
    op.drop_column('challenges', 'jury_reward')
    op.drop_column('challenges', 'reporter_reward')
    op.drop_column('challenges', 'violation_type')
