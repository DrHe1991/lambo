"""Add message_transfers table for two-step SAT transfers in chat

Revision ID: aa1bb2cc3dd4
Revises: z6a7b8c9d0e1
Create Date: 2026-05-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'aa1bb2cc3dd4'
down_revision: Union[str, None] = 'z6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'message_transfers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('message_id', sa.Integer(), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=False),
        sa.Column('recipient_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('note', sa.String(length=140), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.Column('refunded_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['recipient_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('message_id'),
    )
    op.create_index('ix_message_transfers_message_id', 'message_transfers', ['message_id'])
    op.create_index('ix_message_transfers_status', 'message_transfers', ['status'])

    # Backfill: any pre-existing 'transfer' message used the old single-step
    # flow where money already moved on send, so mark them accepted.
    op.execute(
        """
        INSERT INTO message_transfers (message_id, sender_id, recipient_id, amount, note, status, created_at, accepted_at)
        SELECT
            m.id,
            m.sender_id,
            (SELECT cm.user_id FROM chat_members cm
                WHERE cm.session_id = m.session_id AND cm.user_id <> m.sender_id
                LIMIT 1),
            COALESCE(NULLIF(regexp_replace(m.content, '.*"amount":\\s*([0-9]+).*', '\\1'), m.content)::int, 0),
            NULL,
            'accepted',
            m.created_at,
            m.created_at
        FROM messages m
        WHERE m.message_type = 'transfer'
        ON CONFLICT (message_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index('ix_message_transfers_status', table_name='message_transfers')
    op.drop_index('ix_message_transfers_message_id', table_name='message_transfers')
    op.drop_table('message_transfers')
