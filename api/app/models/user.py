from datetime import datetime, date
from sqlalchemy import String, Integer, ForeignKey, DateTime, UniqueConstraint, Boolean, JSON, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class User(Base):
    """User model for BitLink — non-custodial tipping."""

    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    handle: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    avatar: Mapped[str | None] = mapped_column(String(500))
    bio: Mapped[str | None] = mapped_column(String(300))

    # Auth
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, default=None)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Privy identity (set on first login via /wallet/link)
    privy_user_id: Mapped[str | None] = mapped_column(
        String(100), unique=True, index=True, default=None
    )
    embedded_wallet_address: Mapped[str | None] = mapped_column(
        String(42), unique=True, index=True, default=None
    )
    delegated_actions_enabled_at: Mapped[datetime | None] = mapped_column(
        DateTime, default=None
    )

    # Trust sub-scores (used for moderation, not money). Kept from prior model.
    creator_score: Mapped[int] = mapped_column(Integer, default=150)
    curator_score: Mapped[int] = mapped_column(Integer, default=150)
    juror_score: Mapped[int] = mapped_column(Integer, default=300)
    risk_score: Mapped[int] = mapped_column(Integer, default=30)
    trust_score: Mapped[int] = mapped_column(Integer, default=135)

    # Daily free post quota (resets at midnight UTC). Non-monetary — Apple 3.1.5(v) compatible.
    free_posts_remaining: Mapped[int] = mapped_column(Integer, default=3)
    free_posts_reset_date: Mapped[date | None] = mapped_column(Date, default=None)

    # AI-tracked topic interests (accumulated from liked posts' tags)
    interest_tags: Mapped[dict | None] = mapped_column(JSON, default=None)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    posts: Mapped[list['Post']] = relationship('Post', back_populates='author')
    comments: Mapped[list['Comment']] = relationship(
        'Comment', back_populates='author', foreign_keys='Comment.author_id'
    )

    followers: Mapped[list['Follow']] = relationship(
        'Follow',
        foreign_keys='Follow.following_id',
        back_populates='following',
    )
    following: Mapped[list['Follow']] = relationship(
        'Follow',
        foreign_keys='Follow.follower_id',
        back_populates='follower',
    )

    drafts: Mapped[list['Draft']] = relationship(
        'Draft', back_populates='author', cascade='all, delete-orphan'
    )

    auth_providers: Mapped[list['UserAuthProvider']] = relationship(
        'UserAuthProvider', back_populates='user', cascade='all, delete-orphan'
    )


class Follow(Base):
    """Follow relationship between users."""

    __tablename__ = 'follows'

    id: Mapped[int] = mapped_column(primary_key=True)
    follower_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    following_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    follower: Mapped['User'] = relationship(
        'User', foreign_keys=[follower_id], back_populates='following'
    )
    following: Mapped['User'] = relationship(
        'User', foreign_keys=[following_id], back_populates='followers'
    )

    __table_args__ = (
        UniqueConstraint('follower_id', 'following_id', name='unique_follow'),
    )
