from datetime import datetime
from enum import Enum
from sqlalchemy import String, BigInteger, ForeignKey, DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class LedgerAction(str, Enum):
    DEPOSIT = 'deposit'
    WITHDRAW = 'withdraw'
    WITHDRAW_FEE = 'withdraw_fee'
    TRANSFER_IN = 'transfer_in'
    TRANSFER_OUT = 'transfer_out'
    REFUND = 'refund'
    # Exchange actions
    EXCHANGE_IN = 'exchange_in'
    EXCHANGE_OUT = 'exchange_out'
    EXCHANGE_BONUS = 'exchange_bonus'


class PayLedger(Base):
    """Immutable ledger of all balance changes - audit trail."""
    __tablename__ = 'pay_ledger'

    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey('pay_wallets.id', ondelete='CASCADE'), index=True
    )
    
    # +amount = credit, -amount = debit
    amount: Mapped[int] = mapped_column(BigInteger)
    balance_after: Mapped[int] = mapped_column(BigInteger)
    
    action: Mapped[str] = mapped_column(String(30), index=True)
    
    # Reference to related record
    ref_type: Mapped[str | None] = mapped_column(String(20), default=None)
    ref_id: Mapped[int | None] = mapped_column(Integer, default=None)
    
    # Additional details
    description: Mapped[str | None] = mapped_column(Text, default=None)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    # Relationships
    wallet: Mapped['Wallet'] = relationship('Wallet', back_populates='ledger_entries')
