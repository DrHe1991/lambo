"""Reward models - simplified for minimal system. Only InteractionLog kept."""
from datetime import datetime
from enum import Enum
from sqlalchemy import String, Integer, ForeignKey, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class InteractionType(str, Enum):
    """Types of interactions tracked."""
    LIKE = 'like'
    COMMENT = 'comment'
    REPLY = 'reply'
    COMMENT_LIKE = 'comment_like'


class InteractionLog(Base):
    """Tracks every interaction between two users."""

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


# RewardPool, PostReward, CommentReward removed in minimal system
