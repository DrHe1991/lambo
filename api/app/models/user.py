from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, UniqueConstraint, BigInteger, Boolean
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

    # Auth
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, default=None)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)

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

    # Stablecoin balance (USDT, 6 decimals)
    stable_balance: Mapped[int] = mapped_column(BigInteger, default=0)

    # Pay service wallet ID (for crypto deposits/withdrawals)
    pay_wallet_id: Mapped[int | None] = mapped_column(Integer, default=None)

    # First exchange bonus tracking
    first_deposit_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    first_exchange_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    welcome_bonus_claimed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Every new user gets 1 free public post
    free_posts_remaining: Mapped[int] = mapped_column(Integer, default=1)

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

    # Drafts
    drafts: Mapped[list['Draft']] = relationship(
        'Draft', back_populates='author', cascade='all, delete-orphan'
    )

    # Auth providers
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
