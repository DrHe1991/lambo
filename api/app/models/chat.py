from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ChatSession(Base):
    """Chat session - supports 1:1 and group chats."""

    __tablename__ = 'chat_sessions'

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str | None] = mapped_column(String(100), default=None)
    is_group: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # For DMs: who initiated the conversation (for 1-msg limit tracking)
    initiated_by: Mapped[int | None] = mapped_column(
        ForeignKey('users.id', ondelete='SET NULL'), default=None
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    members: Mapped[list['ChatMember']] = relationship(
        'ChatMember', back_populates='session', cascade='all, delete-orphan'
    )
    messages: Mapped[list['Message']] = relationship(
        'Message', back_populates='session', cascade='all, delete-orphan'
    )


class ChatMember(Base):
    """Membership in a chat session."""

    __tablename__ = 'chat_members'

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey('chat_sessions.id', ondelete='CASCADE')
    )
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))

    # Last read message for unread count
    last_read_message_id: Mapped[int | None] = mapped_column(Integer, default=None)

    # Timestamps
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    session: Mapped['ChatSession'] = relationship('ChatSession', back_populates='members')


class Message(Base):
    """Chat message."""

    __tablename__ = 'messages'

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey('chat_sessions.id', ondelete='CASCADE')
    )
    sender_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    content: Mapped[str] = mapped_column(Text)

    # Message type: 'text' (normal) or 'system' (system notification, user-specific)
    message_type: Mapped[str] = mapped_column(String(20), default='text')

    # Status: 'sent' (delivered) or 'pending' (waiting for recipient to reply/follow)
    status: Mapped[str] = mapped_column(String(20), default='sent')

    # For system messages: which user should see this (null = all members)
    visible_to: Mapped[int | None] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'), default=None
    )

    # Reply to another message
    reply_to_id: Mapped[int | None] = mapped_column(
        ForeignKey('messages.id', ondelete='SET NULL'), default=None
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    session: Mapped['ChatSession'] = relationship('ChatSession', back_populates='messages')
    reply_to: Mapped['Message | None'] = relationship(
        'Message', remote_side='Message.id', foreign_keys=[reply_to_id]
    )
    reactions: Mapped[list['MessageReaction']] = relationship(
        'MessageReaction', back_populates='message', cascade='all, delete-orphan'
    )


class MessageReaction(Base):
    """Emoji reaction on a message."""

    __tablename__ = 'message_reactions'

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(
        ForeignKey('messages.id', ondelete='CASCADE')
    )
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    emoji: Mapped[str] = mapped_column(String(10))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    message: Mapped['Message'] = relationship('Message', back_populates='reactions')