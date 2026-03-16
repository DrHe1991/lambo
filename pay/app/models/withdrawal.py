from datetime import datetime
from enum import Enum
from sqlalchemy import String, BigInteger, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class WithdrawalStatus(str, Enum):
    PENDING = 'pending'        # Requested, awaiting processing
    PROCESSING = 'processing'  # Being processed (signing/broadcasting)
    BROADCAST = 'broadcast'    # Transaction broadcast, awaiting confirmation
    CONFIRMED = 'confirmed'    # Transaction confirmed on-chain
    FAILED = 'failed'          # Failed to process
    CANCELLED = 'cancelled'    # Cancelled by user or admin


class Withdrawal(Base):
    """Outgoing withdrawal request record."""
    __tablename__ = 'pay_withdrawals'

    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey('pay_wallets.id', ondelete='CASCADE'), index=True
    )
    
    chain: Mapped[str] = mapped_column(String(20), index=True)
    to_address: Mapped[str] = mapped_column(String(100))
    
    # Token info
    token_contract: Mapped[str | None] = mapped_column(String(100), default=None)
    token_symbol: Mapped[str] = mapped_column(String(20), default='TRX')
    
    # Amount in smallest unit
    amount: Mapped[int] = mapped_column(BigInteger)
    fee: Mapped[int] = mapped_column(BigInteger, default=0)
    
    status: Mapped[str] = mapped_column(
        String(20), default=WithdrawalStatus.PENDING.value, index=True
    )
    
    # Transaction details (filled after broadcast)
    tx_hash: Mapped[str | None] = mapped_column(String(100), index=True, default=None)
    block_number: Mapped[int | None] = mapped_column(BigInteger, default=None)
    
    # Error message if failed
    error_message: Mapped[str | None] = mapped_column(Text, default=None)
    
    # Timestamps
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    wallet: Mapped['Wallet'] = relationship('Wallet', back_populates='withdrawals')
