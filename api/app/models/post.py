from datetime import datetime
from enum import Enum
from sqlalchemy import String, Integer, BigInteger, ForeignKey, DateTime, Text, UniqueConstraint, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class PostType(str, Enum):
    """Type of post content."""
    NOTE = 'note'
    ARTICLE = 'article'
    QUESTION = 'question'


class ContentFormat(str, Enum):
    """Content format for posts."""
    PLAIN = 'plain'
    MARKDOWN = 'markdown'


class PostStatus(str, Enum):
    """Status of a post."""
    ACTIVE = 'active'
    DELETED = 'deleted'
    CHALLENGED = 'challenged'


class Post(Base):
    """Post model — supports notes, articles, questions. No economic state on row."""

    __tablename__ = 'posts'

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    title: Mapped[str | None] = mapped_column(String(200), default=None)
    content: Mapped[str] = mapped_column(Text)
    content_format: Mapped[str] = mapped_column(String(20), default=ContentFormat.PLAIN.value)
    post_type: Mapped[str] = mapped_column(String(20), default=PostType.NOTE.value)
    status: Mapped[str] = mapped_column(String(20), default=PostStatus.ACTIVE.value)

    # Engagement counters (denormalized for performance)
    likes_count: Mapped[int] = mapped_column(Integer, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, default=0)

    # For questions — bounty in micro-USDC (1_000_000 = $1.00)
    bounty: Mapped[int | None] = mapped_column(BigInteger, default=None)

    # Cached tip aggregates (refreshed on each /tip/confirm)
    tip_count: Mapped[int] = mapped_column(Integer, default=0)
    tip_total_usdc_micro: Mapped[int] = mapped_column(BigInteger, default=0)

    # Attached media URLs (images)
    media_urls: Mapped[list] = mapped_column(JSON, default=list)

    # AI-generated content flag
    is_ai: Mapped[bool] = mapped_column(Boolean, default=False)

    # AI evaluation results (used for ranking/moderation, not money)
    quality: Mapped[str | None] = mapped_column(String(20), default=None)
    tags: Mapped[list | None] = mapped_column(JSON, default=None)
    ai_summary: Mapped[str | None] = mapped_column(Text, default=None)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    author: Mapped['User'] = relationship('User', back_populates='posts')
    comments: Mapped[list['Comment']] = relationship(
        'Comment', back_populates='post', cascade='all, delete-orphan'
    )


class Comment(Base):
    """Comment on a post. Free, no economic state."""

    __tablename__ = 'comments'

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey('posts.id', ondelete='CASCADE'))
    author_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    content: Mapped[str] = mapped_column(Text)

    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey('comments.id', ondelete='CASCADE'), default=None
    )

    likes_count: Mapped[int] = mapped_column(Integer, default=0)

    # Soft-delete flag
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    post: Mapped['Post'] = relationship('Post', back_populates='comments')
    author: Mapped['User'] = relationship('User', back_populates='comments', foreign_keys=[author_id])
    replies: Mapped[list['Comment']] = relationship(
        'Comment', back_populates='parent', cascade='all, delete-orphan'
    )
    parent: Mapped['Comment | None'] = relationship(
        'Comment', back_populates='replies', remote_side=[id]
    )


class PostLike(Base):
    """A like on a post. Each like corresponds to a tip transaction on Base.

    The tx_hash is set after on-chain verification via /tip/confirm.
    Until then the like is treated as 'pending' from the client's perspective
    but the row is created optimistically when the user submits the tip.
    """

    __tablename__ = 'post_likes'

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey('posts.id', ondelete='CASCADE'))
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # On-chain reference (Base mainnet USDC transfer)
    tx_hash: Mapped[str | None] = mapped_column(String(66), unique=True, default=None)
    amount_usdc_micro: Mapped[int] = mapped_column(BigInteger, default=0)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)

    __table_args__ = (
        UniqueConstraint('post_id', 'user_id', name='uq_post_like'),
    )


class CommentLike(Base):
    """A like on a comment. Free social signal, no on-chain side-effect."""

    __tablename__ = 'comment_likes'

    id: Mapped[int] = mapped_column(primary_key=True)
    comment_id: Mapped[int] = mapped_column(ForeignKey('comments.id', ondelete='CASCADE'))
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('comment_id', 'user_id', name='uq_comment_like'),
    )
