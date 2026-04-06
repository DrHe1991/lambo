from datetime import datetime
from enum import Enum
from sqlalchemy import String, Integer, BigInteger, ForeignKey, DateTime, Text, UniqueConstraint, Float, Boolean, JSON
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


class InteractionStatus(str, Enum):
    """Status of a like/comment interaction for 24h lock settlement."""
    PENDING = 'pending'      # Locked, awaiting settlement
    SETTLED = 'settled'      # Settled to author
    CANCELLED = 'cancelled'  # User cancelled, 30% penalty applied


class Post(Base):
    """Post model - supports both notes and questions."""

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

    # For questions - bounty amount
    bounty: Mapped[int | None] = mapped_column(Integer, default=None)

    # How much the author paid to publish (0 = free post)
    cost_paid: Mapped[int] = mapped_column(BigInteger, default=0)

    # Attached media URLs (images)
    media_urls: Mapped[list] = mapped_column(JSON, default=list)

    # AI-generated content flag
    is_ai: Mapped[bool] = mapped_column(default=False)

    # Boost (paid promotion)
    boost_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    boost_remaining: Mapped[float] = mapped_column(Float, default=0.0)

    # AI-assessed quality and summary
    quality_score: Mapped[int | None] = mapped_column(Integer, default=None)
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

    # 24h lock settlement fields
    interaction_status: Mapped[str] = mapped_column(
        String(20), default=InteractionStatus.SETTLED.value
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    recipient_id: Mapped[int | None] = mapped_column(
        ForeignKey('users.id', ondelete='SET NULL'), default=None
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    post: Mapped['Post'] = relationship('Post', back_populates='comments')
    author: Mapped['User'] = relationship('User', back_populates='comments', foreign_keys=[author_id])
    recipient: Mapped['User | None'] = relationship('User', foreign_keys=[recipient_id])
    replies: Mapped[list['Comment']] = relationship(
        'Comment', back_populates='parent', cascade='all, delete-orphan'
    )
    parent: Mapped['Comment | None'] = relationship(
        'Comment', back_populates='replies', remote_side=[id]
    )


class PostLike(Base):
    """Tracks who liked which post with full weight components."""

    __tablename__ = 'post_likes'

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey('posts.id', ondelete='CASCADE'))
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Weight components (S9) - stored at creation time
    w_trust: Mapped[float] = mapped_column(Float, default=1.0)        # Liker trust tier weight
    n_novelty: Mapped[float] = mapped_column(Float, default=1.0)      # Interaction freshness
    s_source: Mapped[float] = mapped_column(Float, default=1.0)       # Stranger vs follower
    ce_entropy: Mapped[float] = mapped_column(Float, default=1.0)     # Consensus diversity
    cross_circle: Mapped[float] = mapped_column(Float, default=1.0)   # Cross-circle bonus
    cabal_penalty: Mapped[float] = mapped_column(Float, default=1.0)  # Cabal member penalty

    # Computed total weight
    total_weight: Mapped[float] = mapped_column(Float, default=1.0)

    # Is this a cross-circle like? (liker not following author)
    is_cross_circle: Mapped[bool] = mapped_column(Boolean, default=False)

    # Total earnings from early supporter revenue sharing (minimal system)
    earnings: Mapped[int] = mapped_column(BigInteger, default=0)

    # 24h lock settlement fields
    status: Mapped[str] = mapped_column(
        String(20), default=InteractionStatus.SETTLED.value
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    cost_paid: Mapped[int] = mapped_column(BigInteger, default=0)
    recipient_id: Mapped[int | None] = mapped_column(
        ForeignKey('users.id', ondelete='SET NULL'), default=None
    )

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

    # 24h lock settlement fields
    status: Mapped[str] = mapped_column(
        String(20), default=InteractionStatus.SETTLED.value
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    cost_paid: Mapped[int] = mapped_column(BigInteger, default=0)
    recipient_id: Mapped[int | None] = mapped_column(
        ForeignKey('users.id', ondelete='SET NULL'), default=None
    )

    __table_args__ = (
        UniqueConstraint('comment_id', 'user_id', name='uq_comment_like'),
    )
