from datetime import datetime
from enum import Enum
from sqlalchemy import String, BigInteger, ForeignKey, DateTime, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class DepositStatus(str, Enum):
    PENDING = 'pending'      # Detected but not enough confirmations
    CONFIRMING = 'confirming'  # Has some confirmations
    CONFIRMED = 'confirmed'   # Enough confirmations, credited to wallet
    FAILED = 'failed'        # Transaction failed/reverted


class Deposit(Base):
    """Incoming deposit transaction record."""
    __tablename__ = 'pay_deposits'
    __table_args__ = (
        UniqueConstraint('chain', 'tx_hash', name='uq_deposit_chain_tx'),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey('pay_wallets.id', ondelete='CASCADE'), index=True
    )
    deposit_address_id: Mapped[int] = mapped_column(
        ForeignKey('pay_deposit_addresses.id', ondelete='CASCADE'), index=True
    )
    
    chain: Mapped[str] = mapped_column(String(20), index=True)
    tx_hash: Mapped[str] = mapped_column(String(100), index=True)
    block_number: Mapped[int] = mapped_column(BigInteger)
    
    # Token info
    token_contract: Mapped[str | None] = mapped_column(String(100), default=None)
    token_symbol: Mapped[str] = mapped_column(String(20), default='TRX')
    
    # Amount in smallest unit
    amount: Mapped[int] = mapped_column(BigInteger)
    
    # Sender address
    from_address: Mapped[str] = mapped_column(String(100))
    
    # Confirmation tracking
    confirmations: Mapped[int] = mapped_column(Integer, default=0)
    required_confirmations: Mapped[int] = mapped_column(Integer, default=20)
    status: Mapped[str] = mapped_column(
        String(20), default=DepositStatus.PENDING.value, index=True
    )
    
    # When balance was credited (null if not yet)
    credited_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    wallet: Mapped['Wallet'] = relationship('Wallet', back_populates='deposits')
    deposit_address: Mapped['DepositAddress'] = relationship(
        'DepositAddress', back_populates='deposits'
    )
