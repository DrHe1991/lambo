"""add group chat features

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-02-22 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, None] = 'f6g7h8i9j0k1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ChatSession additions
    op.add_column('chat_sessions', sa.Column('avatar', sa.String(500), nullable=True))
    op.add_column('chat_sessions', sa.Column('description', sa.String(500), nullable=True))
    op.add_column('chat_sessions', sa.Column('owner_id', sa.Integer(), nullable=True))
    op.add_column('chat_sessions', sa.Column('member_limit', sa.Integer(), nullable=True, server_default='500'))
    op.add_column('chat_sessions', sa.Column('join_approval', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('chat_sessions', sa.Column('who_can_send', sa.String(20), nullable=False, server_default='all'))
    op.add_column('chat_sessions', sa.Column('who_can_add', sa.String(20), nullable=False, server_default='all'))
    op.create_foreign_key('fk_chat_sessions_owner_id', 'chat_sessions', 'users', ['owner_id'], ['id'], ondelete='SET NULL')

    # ChatMember additions
    op.add_column('chat_members', sa.Column('role', sa.String(20), nullable=False, server_default='member'))
    op.add_column('chat_members', sa.Column('is_muted', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('chat_members', sa.Column('muted_until', sa.DateTime(), nullable=True))
    op.add_column('chat_members', sa.Column('invited_by', sa.Integer(), nullable=True))
    op.add_column('chat_members', sa.Column('left_at', sa.DateTime(), nullable=True))
    op.create_foreign_key('fk_chat_members_invited_by', 'chat_members', 'users', ['invited_by'], ['id'], ondelete='SET NULL')

    # GroupInviteLink table
    op.create_table(
        'group_invite_links',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code', sa.String(20), nullable=False, unique=True, index=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('use_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    # Drop GroupInviteLink table
    op.drop_table('group_invite_links')

    # ChatMember removals
    op.drop_constraint('fk_chat_members_invited_by', 'chat_members', type_='foreignkey')
    op.drop_column('chat_members', 'left_at')
    op.drop_column('chat_members', 'invited_by')
    op.drop_column('chat_members', 'muted_until')
    op.drop_column('chat_members', 'is_muted')
    op.drop_column('chat_members', 'role')

    # ChatSession removals
    op.drop_constraint('fk_chat_sessions_owner_id', 'chat_sessions', type_='foreignkey')
    op.drop_column('chat_sessions', 'who_can_add')
    op.drop_column('chat_sessions', 'who_can_send')
    op.drop_column('chat_sessions', 'join_approval')
    op.drop_column('chat_sessions', 'member_limit')
    op.drop_column('chat_sessions', 'owner_id')
    op.drop_column('chat_sessions', 'description')
    op.drop_column('chat_sessions', 'avatar')
