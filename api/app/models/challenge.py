from datetime import datetime
from enum import Enum
from sqlalchemy import (
    String, Integer, BigInteger, Float, ForeignKey, DateTime, Text, Index, Boolean,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ChallengeStatus(str, Enum):
    """Status of a challenge."""
    PENDING = 'pending'
    VOTING = 'voting'       # L2: jury voting in progress
    ESCALATED = 'escalated' # Escalated to next layer
    GUILTY = 'guilty'
    NOT_GUILTY = 'not_guilty'


class ContentType(str, Enum):
    """Type of content being challenged."""
    POST = 'post'
    COMMENT = 'comment'


class ViolationType(str, Enum):
    """Type of violation with associated fine multiplier."""
    LOW_QUALITY = 'low_quality'   # 0.5x
    SPAM = 'spam'                 # 1.0x
    PLAGIARISM = 'plagiarism'     # 1.5x
    SCAM = 'scam'                 # 2.0x


# Fee and fine configuration
LAYER_FEES = {1: 100, 2: 500, 3: 1500}
VIOLATION_MULTIPLIERS = {
    ViolationType.LOW_QUALITY.value: 0.5,
    ViolationType.SPAM.value: 1.0,
    ViolationType.PLAGIARISM.value: 1.5,
    ViolationType.SCAM.value: 2.0,
}
BASE_FINE = 200  # Base fine amount in sat

# Fine distribution
FINE_TO_REPORTER = 0.35
FINE_TO_JURY = 0.25
FINE_TO_PLATFORM = 0.40


class Challenge(Base):
    """Multi-layer challenge system for content moderation."""

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
    violation_type: Mapped[str | None] = mapped_column(String(20), default=None)
    layer: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(
        String(20), default=ChallengeStatus.PENDING.value,
    )

    # Financials
    fee_paid: Mapped[int] = mapped_column(BigInteger, default=0)
    fine_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    reporter_reward: Mapped[int] = mapped_column(BigInteger, default=0)
    jury_reward: Mapped[int] = mapped_column(BigInteger, default=0)
    platform_share: Mapped[int] = mapped_column(BigInteger, default=0)

    # AI verdict details (L1)
    ai_verdict: Mapped[str | None] = mapped_column(String(20), default=None)
    ai_reason: Mapped[str | None] = mapped_column(Text, default=None)
    ai_confidence: Mapped[float | None] = mapped_column(Float, default=None)

    # Jury voting (L2)
    votes_guilty: Mapped[int] = mapped_column(Integer, default=0)
    votes_not_guilty: Mapped[int] = mapped_column(Integer, default=0)
    jury_size: Mapped[int] = mapped_column(Integer, default=5)
    voting_deadline: Mapped[datetime | None] = mapped_column(DateTime, default=None)

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
    votes: Mapped[list['JuryVote']] = relationship(
        'JuryVote', back_populates='challenge',
    )

    __table_args__ = (
        Index('ix_challenge_content', 'content_type', 'content_id'),
        Index('ix_challenge_challenger', 'challenger_id'),
        Index('ix_challenge_author', 'author_id'),
        Index('ix_challenge_status', 'status'),
    )


class JuryVote(Base):
    """Individual jury vote on a L2/L3 challenge."""

    __tablename__ = 'jury_votes'

    id: Mapped[int] = mapped_column(primary_key=True)
    challenge_id: Mapped[int] = mapped_column(
        ForeignKey('challenges.id', ondelete='CASCADE'),
    )
    juror_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'),
    )

    # Vote
    vote_guilty: Mapped[bool] = mapped_column(Boolean)
    reasoning: Mapped[str | None] = mapped_column(Text, default=None)

    # Reward tracking
    reward_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    voted_with_majority: Mapped[bool | None] = mapped_column(Boolean, default=None)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    challenge: Mapped['Challenge'] = relationship('Challenge', back_populates='votes')
    juror: Mapped['User'] = relationship('User')

    __table_args__ = (
        Index('ix_jury_vote_challenge', 'challenge_id'),
        Index('ix_jury_vote_juror', 'juror_id'),
    )
