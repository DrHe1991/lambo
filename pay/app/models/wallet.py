from datetime import datetime
from enum import Enum
from sqlalchemy import String, BigInteger, ForeignKey, DateTime, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Chain(str, Enum):
    TRON = 'tron'
    ETHEREUM = 'ethereum'
    BSC = 'bsc'
    POLYGON = 'polygon'
    SOLANA = 'solana'
    BITCOIN = 'bitcoin'


class Wallet(Base):
    """User wallet within an app."""
    __tablename__ = 'pay_wallets'
    __table_args__ = (
        UniqueConstraint('app_id', 'external_user_id', name='uq_wallet_app_user'),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    app_id: Mapped[int] = mapped_column(
        ForeignKey('pay_apps.id', ondelete='CASCADE'), index=True
    )
    external_user_id: Mapped[str] = mapped_column(String(100), index=True)
    
    # Legacy single balance field (deprecated, use WalletBalance instead)
    balance: Mapped[int] = mapped_column(BigInteger, default=0)
    locked_balance: Mapped[int] = mapped_column(BigInteger, default=0)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    app: Mapped['App'] = relationship('App', back_populates='wallets')
    deposit_addresses: Mapped[list['DepositAddress']] = relationship(
        'DepositAddress', back_populates='wallet', lazy='selectin'
    )
    deposits: Mapped[list['Deposit']] = relationship(
        'Deposit', back_populates='wallet', lazy='selectin'
    )
    withdrawals: Mapped[list['Withdrawal']] = relationship(
        'Withdrawal', back_populates='wallet', lazy='selectin'
    )
    ledger_entries: Mapped[list['PayLedger']] = relationship(
        'PayLedger', back_populates='wallet', lazy='selectin'
    )
    token_balances: Mapped[list['WalletBalance']] = relationship(
        'WalletBalance', back_populates='wallet', lazy='selectin'
    )


class WalletBalance(Base):
    """Balance per token for a wallet."""
    __tablename__ = 'pay_wallet_balances'
    __table_args__ = (
        UniqueConstraint('wallet_id', 'token_symbol', name='uq_wallet_balance_token'),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey('pay_wallets.id', ondelete='CASCADE'), index=True
    )
    
    token_symbol: Mapped[str] = mapped_column(String(20))
    token_contract: Mapped[str | None] = mapped_column(String(100), default=None)
    
    balance: Mapped[int] = mapped_column(BigInteger, default=0)
    locked_balance: Mapped[int] = mapped_column(BigInteger, default=0)
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    wallet: Mapped['Wallet'] = relationship('Wallet', back_populates='token_balances')


class DepositAddress(Base):
    """HD-derived deposit address for a wallet on a specific chain."""
    __tablename__ = 'pay_deposit_addresses'
    __table_args__ = (
        UniqueConstraint('chain', 'address', name='uq_deposit_address_chain_addr'),
        UniqueConstraint('chain', 'derivation_index', name='uq_deposit_address_chain_index'),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey('pay_wallets.id', ondelete='CASCADE'), index=True
    )
    
    chain: Mapped[str] = mapped_column(String(20), index=True)
    address: Mapped[str] = mapped_column(String(100), index=True)
    derivation_index: Mapped[int] = mapped_column(Integer)
    
    last_scanned_block: Mapped[int] = mapped_column(BigInteger, default=0)
    
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    # Relationships
    wallet: Mapped['Wallet'] = relationship('Wallet', back_populates='deposit_addresses')
    deposits: Mapped[list['Deposit']] = relationship(
        'Deposit', back_populates='deposit_address', lazy='selectin'
    )
