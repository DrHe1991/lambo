from datetime import datetime
from enum import Enum
from decimal import Decimal
from sqlalchemy import String, BigInteger, ForeignKey, DateTime, Integer, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ExchangeDirection(str, Enum):
    BUY_SAT = 'buy_sat'   # USDT -> sat
    SELL_SAT = 'sell_sat'  # sat -> USDT


class ExchangeStatus(str, Enum):
    PENDING = 'pending'
    CONFIRMED = 'confirmed'
    EXPIRED = 'expired'
    CANCELLED = 'cancelled'


class ExchangeQuota(Base):
    '''Platform-wide exchange quota for rate limiting and reserve protection.'''
    __tablename__ = 'pay_exchange_quotas'

    id: Mapped[int] = mapped_column(primary_key=True)
    direction: Mapped[str] = mapped_column(String(20), index=True)  # buy_sat or sell_sat
    
    # For buy_sat: amount in USDT (6 decimals)
    # For sell_sat: amount in sat
    initial_amount: Mapped[int] = mapped_column(BigInteger)
    remaining_amount: Mapped[int] = mapped_column(BigInteger)
    
    # BTC price at quota initialization (for reference)
    btc_price_at_init: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    
    # Quota validity period
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    
    is_active: Mapped[bool] = mapped_column(default=True)


class ExchangePreview(Base):
    '''30-second valid preview for exchange transaction.'''
    __tablename__ = 'pay_exchange_previews'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey('pay_wallets.id', ondelete='CASCADE'), index=True
    )
    
    direction: Mapped[str] = mapped_column(String(20))  # buy_sat or sell_sat
    
    # Input amount (USDT 6 decimals for buy_sat, sat for sell_sat)
    amount_in: Mapped[int] = mapped_column(BigInteger)
    # Output amount (sat for buy_sat, USDT 6 decimals for sell_sat)
    amount_out: Mapped[int] = mapped_column(BigInteger)
    
    # Exchange rate details
    btc_price: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    buffer_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal('0.005'))
    
    # Bonus (only for first exchange)
    bonus_sat: Mapped[int] = mapped_column(BigInteger, default=0)
    
    status: Mapped[str] = mapped_column(String(20), default=ExchangeStatus.PENDING.value)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    
    # Relationships
    wallet: Mapped['Wallet'] = relationship('Wallet')


class Exchange(Base):
    '''Completed exchange transaction record.'''
    __tablename__ = 'pay_exchanges'

    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey('pay_wallets.id', ondelete='CASCADE'), index=True
    )
    preview_id: Mapped[str] = mapped_column(String(36), index=True)
    
    direction: Mapped[str] = mapped_column(String(20))
    
    # Amounts
    amount_in: Mapped[int] = mapped_column(BigInteger)
    amount_out: Mapped[int] = mapped_column(BigInteger)
    
    # Rate at execution
    btc_price: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    buffer_fee: Mapped[int] = mapped_column(BigInteger, default=0)  # In output currency
    
    # Bonus applied
    bonus_sat: Mapped[int] = mapped_column(BigInteger, default=0)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    wallet: Mapped['Wallet'] = relationship('Wallet')


class RebalanceLog(Base):
    '''Log of CEX rebalancing operations.'''
    __tablename__ = 'pay_rebalance_logs'

    id: Mapped[int] = mapped_column(primary_key=True)
    
    # Trigger type
    trigger_type: Mapped[str] = mapped_column(String(20))  # scheduled, quota_low, manual
    
    # Balances before rebalance
    btc_before: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    usdt_before: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    
    # Balances after rebalance
    btc_after: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    usdt_after: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    
    # Trade details (if any)
    trade_direction: Mapped[str | None] = mapped_column(String(10))  # buy_btc or sell_btc
    trade_amount: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    cex_order_id: Mapped[str | None] = mapped_column(String(50))
    
    # BTC price at rebalance
    btc_price: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    
    # Status
    status: Mapped[str] = mapped_column(String(20), default='completed')
    error_message: Mapped[str | None] = mapped_column(Text)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ReserveSnapshot(Base):
    '''Periodic snapshot of CEX reserve state.'''
    __tablename__ = 'pay_reserve_snapshots'

    id: Mapped[int] = mapped_column(primary_key=True)
    
    btc_balance: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    usdt_balance: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    btc_price: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    
    # Calculated values
    total_value_usd: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    btc_ratio: Mapped[Decimal] = mapped_column(Numeric(5, 4))  # 0.0000 to 1.0000
    
    # Current quotas
    buy_sat_quota_remaining: Mapped[int] = mapped_column(BigInteger, default=0)
    sell_sat_quota_remaining: Mapped[int] = mapped_column(BigInteger, default=0)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
