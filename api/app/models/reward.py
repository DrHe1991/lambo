from datetime import datetime
from enum import Enum
from sqlalchemy import (
    String, Integer, BigInteger, Float, ForeignKey, DateTime, Index,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class InteractionType(str, Enum):
    """Types of interactions tracked for N_novelty."""
    LIKE = 'like'
    COMMENT = 'comment'
    REPLY = 'reply'
    COMMENT_LIKE = 'comment_like'


class InteractionLog(Base):
    """Tracks every interaction between two users for N_novelty decay."""

    __tablename__ = 'interaction_logs'

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'),
    )
    target_user_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'),
    )
    interaction_type: Mapped[str] = mapped_column(String(20))
    ref_id: Mapped[int | None] = mapped_column(Integer, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_interaction_actor_target', 'actor_id', 'target_user_id'),
        Index('ix_interaction_created', 'created_at'),
    )


class PoolStatus(str, Enum):
    PENDING = 'pending'
    SETTLED = 'settled'


class RewardPool(Base):
    """Daily reward pool — accumulates fees + platform emission."""

    __tablename__ = 'reward_pools'

    id: Mapped[int] = mapped_column(primary_key=True)
    # The settlement date (posts that matured on this date)
    settle_date: Mapped[str] = mapped_column(String(10), unique=True)
    total_pool: Mapped[int] = mapped_column(BigInteger, default=0)
    total_distributed: Mapped[int] = mapped_column(BigInteger, default=0)
    post_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(10), default=PoolStatus.PENDING.value)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)


class SettlementStatus(str, Enum):
    PENDING = 'pending'
    SETTLED = 'settled'


class PostReward(Base):
    """Per-post settlement record. Created when a post reaches T+7d."""

    __tablename__ = 'post_rewards'

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey('posts.id', ondelete='CASCADE'), unique=True,
    )
    pool_id: Mapped[int | None] = mapped_column(
        ForeignKey('reward_pools.id', ondelete='SET NULL'), default=None,
    )

    # Discovery Score
    discovery_score: Mapped[float] = mapped_column(Float, default=0.0)

    # Reward amounts
    author_reward: Mapped[int] = mapped_column(BigInteger, default=0)
    comment_pool: Mapped[int] = mapped_column(BigInteger, default=0)

    status: Mapped[str] = mapped_column(
        String(10), default=SettlementStatus.PENDING.value,
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_post_reward_status', 'status'),
    )


class CommentReward(Base):
    """Per-comment settlement within a post's 20% comment pool."""

    __tablename__ = 'comment_rewards'

    id: Mapped[int] = mapped_column(primary_key=True)
    comment_id: Mapped[int] = mapped_column(
        ForeignKey('comments.id', ondelete='CASCADE'), unique=True,
    )
    post_reward_id: Mapped[int] = mapped_column(
        ForeignKey('post_rewards.id', ondelete='CASCADE'),
    )

    discovery_score: Mapped[float] = mapped_column(Float, default=0.0)
    reward_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
