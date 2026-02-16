from datetime import datetime
from enum import Enum
from sqlalchemy import (
    String, Integer, BigInteger, Float, ForeignKey, DateTime, Text, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ChallengeStatus(str, Enum):
    """Status of a challenge."""
    PENDING = 'pending'
    GUILTY = 'guilty'
    NOT_GUILTY = 'not_guilty'


class ContentType(str, Enum):
    """Type of content being challenged."""
    POST = 'post'
    COMMENT = 'comment'


class Challenge(Base):
    """Layer 1 challenge — AI moderation verdict on reported content."""

    __tablename__ = 'challenges'

    id: Mapped[int] = mapped_column(primary_key=True)

    # What was challenged
    content_type: Mapped[str] = mapped_column(String(10))
    content_id: Mapped[int] = mapped_column(Integer)

    # Who's involved
    challenger_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'),
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'),
    )

    # Challenge metadata
    reason: Mapped[str] = mapped_column(String(30))
    layer: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(
        String(20), default=ChallengeStatus.PENDING.value,
    )

    # Financials
    fee_paid: Mapped[int] = mapped_column(BigInteger, default=0)
    fine_amount: Mapped[int] = mapped_column(BigInteger, default=0)

    # AI verdict details
    ai_verdict: Mapped[str | None] = mapped_column(String(20), default=None)
    ai_reason: Mapped[str | None] = mapped_column(Text, default=None)
    ai_confidence: Mapped[float | None] = mapped_column(Float, default=None)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)

    # Relationships
    challenger: Mapped['User'] = relationship(
        'User', foreign_keys=[challenger_id],
    )
    author: Mapped['User'] = relationship(
        'User', foreign_keys=[author_id],
    )

    __table_args__ = (
        Index('ix_challenge_content', 'content_type', 'content_id'),
        Index('ix_challenge_challenger', 'challenger_id'),
        Index('ix_challenge_author', 'author_id'),
        Index('ix_challenge_status', 'status'),
    )
