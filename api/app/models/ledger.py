from datetime import datetime
from enum import Enum
from sqlalchemy import String, BigInteger, ForeignKey, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class ActionType(str, Enum):
    """Off-chain ledger actions. Money movement is on-chain (USDC on Base);
    this ledger only records denormalized aggregates and non-monetary events."""
    TIP_SENT = 'tip_sent'              # User tipped a creator (mirrors on-chain)
    TIP_RECEIVED = 'tip_received'      # Creator received a tip (mirrors on-chain)
    FREE_POST_USED = 'free_post_used'  # Daily free post quota consumed
    MODERATION_PENALTY = 'moderation_penalty'  # Mod action (e.g., post hidden)


class RefType(str, Enum):
    """What entity a ledger entry references."""
    NONE = 'none'
    POST = 'post'
    COMMENT = 'comment'
    USER = 'user'


class Ledger(Base):
    """Off-chain activity log.

    NOTE: Authoritative balance lives on-chain (USDC on Base). This table is
    a denormalized event stream for the Transactions view. amount_usdc_micro
    is positive for inflows (TIP_RECEIVED) and negative for outflows (TIP_SENT).
    """

    __tablename__ = 'ledger'

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'), index=True
    )

    amount_usdc_micro: Mapped[int] = mapped_column(BigInteger, default=0)

    action_type: Mapped[str] = mapped_column(String(30))
    ref_type: Mapped[str] = mapped_column(String(20), default=RefType.NONE.value)
    ref_id: Mapped[int | None] = mapped_column(BigInteger, default=None)

    # On-chain reference for tip rows
    tx_hash: Mapped[str | None] = mapped_column(String(66), default=None)

    note: Mapped[str | None] = mapped_column(String(200), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_ledger_user_created', 'user_id', 'created_at'),
    )
