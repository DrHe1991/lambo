from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, UniqueConstraint, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class User(Base):
    """User model for BitLink platform."""

    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    handle: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    avatar: Mapped[str | None] = mapped_column(String(500))
    bio: Mapped[str | None] = mapped_column(String(300))

    # Trust sub-scores (S8: no hard cap for creator/curator)
    creator_score: Mapped[int] = mapped_column(Integer, default=150)
    curator_score: Mapped[int] = mapped_column(Integer, default=150)
    juror_score: Mapped[int] = mapped_column(Integer, default=300)
    risk_score: Mapped[int] = mapped_column(Integer, default=30)

    # Composite trust score (S8 formula: creator*0.6 + curator*0.3 + juror_bonus - risk_penalty)
    # New user: 150*0.6 + 150*0.3 + 0 - (30/50)^2 ≈ 135
    trust_score: Mapped[int] = mapped_column(Integer, default=135)

    # Sat balance (Spend & Earn)
    available_balance: Mapped[int] = mapped_column(BigInteger, default=0)

    # Every new user gets 1 free public post
    free_posts_remaining: Mapped[int] = mapped_column(Integer, default=1)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    posts: Mapped[list['Post']] = relationship('Post', back_populates='author')
    comments: Mapped[list['Comment']] = relationship('Comment', back_populates='author')

    # Follow relationships
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


class Follow(Base):
    """Follow relationship between users."""

    __tablename__ = 'follows'

    id: Mapped[int] = mapped_column(primary_key=True)
    follower_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    following_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    follower: Mapped['User'] = relationship(
        'User', foreign_keys=[follower_id], back_populates='following'
    )
    following: Mapped['User'] = relationship(
        'User', foreign_keys=[following_id], back_populates='followers'
    )

    __table_args__ = (
        UniqueConstraint('follower_id', 'following_id', name='unique_follow'),
    )
