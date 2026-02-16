from datetime import datetime
from enum import Enum
from sqlalchemy import String, Integer, BigInteger, ForeignKey, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class PostType(str, Enum):
    """Type of post content."""
    NOTE = 'note'
    QUESTION = 'question'


class PostStatus(str, Enum):
    """Status of a post."""
    ACTIVE = 'active'
    DELETED = 'deleted'
    CHALLENGED = 'challenged'


class Post(Base):
    """Post model - supports both notes and questions."""

    __tablename__ = 'posts'

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    content: Mapped[str] = mapped_column(Text)
    post_type: Mapped[str] = mapped_column(String(20), default=PostType.NOTE.value)
    status: Mapped[str] = mapped_column(String(20), default=PostStatus.ACTIVE.value)

    # Engagement counters (denormalized for performance)
    likes_count: Mapped[int] = mapped_column(Integer, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, default=0)

    # For questions - bounty amount
    bounty: Mapped[int | None] = mapped_column(Integer, default=None)

    # How much the author paid to publish (0 = free post)
    cost_paid: Mapped[int] = mapped_column(BigInteger, default=0)

    # AI-generated content flag
    is_ai: Mapped[bool] = mapped_column(default=False)

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
    """Comment on a post. Also used as answers for questions."""

    __tablename__ = 'comments'

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey('posts.id', ondelete='CASCADE'))
    author_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    content: Mapped[str] = mapped_column(Text)

    # For nested replies
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey('comments.id', ondelete='CASCADE'), default=None
    )

    # Engagement
    likes_count: Mapped[int] = mapped_column(Integer, default=0)

    # How much the author paid (comment=50, reply=20, answer=200)
    cost_paid: Mapped[int] = mapped_column(BigInteger, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    post: Mapped['Post'] = relationship('Post', back_populates='comments')
    author: Mapped['User'] = relationship('User', back_populates='comments')
    replies: Mapped[list['Comment']] = relationship(
        'Comment', back_populates='parent', cascade='all, delete-orphan'
    )
    parent: Mapped['Comment | None'] = relationship(
        'Comment', back_populates='replies', remote_side=[id]
    )


class PostLike(Base):
    """Tracks who liked which post (replaces simple counter)."""

    __tablename__ = 'post_likes'

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey('posts.id', ondelete='CASCADE'))
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('post_id', 'user_id', name='uq_post_like'),
    )


class CommentLike(Base):
    """Tracks who liked which comment."""

    __tablename__ = 'comment_likes'

    id: Mapped[int] = mapped_column(primary_key=True)
    comment_id: Mapped[int] = mapped_column(ForeignKey('comments.id', ondelete='CASCADE'))
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('comment_id', 'user_id', name='uq_comment_like'),
    )
