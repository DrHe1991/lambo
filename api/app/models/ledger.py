from datetime import datetime
from enum import Enum
from sqlalchemy import String, Integer, BigInteger, ForeignKey, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class ActionType(str, Enum):
    """All possible ledger action types."""
    # Free actions
    FREE_POST = 'free_post'

    # Income
    REWARD_POST = 'reward_post'
    REWARD_COMMENT = 'reward_comment'
    CHALLENGE_REFUND = 'challenge_refund'
    CHALLENGE_REWARD = 'challenge_reward'
    DEPOSIT = 'deposit'

    # Spending
    SPEND_POST = 'spend_post'
    SPEND_QUESTION = 'spend_question'
    SPEND_ANSWER = 'spend_answer'
    SPEND_COMMENT = 'spend_comment'
    SPEND_REPLY = 'spend_reply'
    SPEND_LIKE = 'spend_like'
    SPEND_COMMENT_LIKE = 'spend_comment_like'
    SPEND_BOOST = 'spend_boost'

    # Penalties & fees
    FINE = 'fine'
    CHALLENGE_FEE = 'challenge_fee'
    WITHDRAW = 'withdraw'


class RefType(str, Enum):
    """What entity a ledger entry references."""
    NONE = 'none'
    POST = 'post'
    COMMENT = 'comment'
    CHALLENGE = 'challenge'
    BOOST = 'boost'
    USER = 'user'


class Ledger(Base):
    """Transaction log — every sat movement is recorded here."""

    __tablename__ = 'ledger'

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'), index=True
    )

    # +amount = earn, -amount = spend
    amount: Mapped[int] = mapped_column(BigInteger)
    balance_after: Mapped[int] = mapped_column(BigInteger)

    action_type: Mapped[str] = mapped_column(String(30))
    ref_type: Mapped[str] = mapped_column(String(20), default=RefType.NONE.value)
    ref_id: Mapped[int | None] = mapped_column(Integer, default=None)

    note: Mapped[str | None] = mapped_column(String(200), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_ledger_user_created', 'user_id', 'created_at'),
    )
