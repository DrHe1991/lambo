from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.exchange import (
    ExchangeQuota,
    RebalanceLog,
    ReserveSnapshot,
    ExchangeDirection,
)
from app.services.cex_client import get_cex_client, BinanceClient


class RebalanceService:
    '''Handles CEX reserve rebalancing and quota management.'''
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.cex = get_cex_client()
        self.settings = get_settings()
    
    async def check_and_rebalance(self, trigger: str = 'scheduled') -> Optional[RebalanceLog]:
        '''Check reserve ratios and rebalance if needed.'''
        # Get current CEX balances
        balances = await self.cex.get_balances()
        btc_price = await self.cex.get_btc_price()
        
        btc_value = balances.btc * btc_price
        total_value = btc_value + balances.usdt
        
        if total_value == 0:
            return None
        
        btc_ratio = btc_value / total_value
        target_ratio = Decimal(str(self.settings.target_btc_ratio))
        deviation = Decimal(str(self.settings.rebalance_deviation))
        
        # Record before state
        btc_before = balances.btc
        usdt_before = balances.usdt
        
        trade_direction = None
        trade_amount = None
        cex_order_id = None
        status = 'completed'
        error_message = None
        
        # Check if rebalance needed
        if abs(btc_ratio - target_ratio) > deviation:
            try:
                if btc_ratio < target_ratio:
                    # BTC is underweight, buy BTC
                    buy_value = (target_ratio - btc_ratio) * total_value
                    order = await self.cex.market_buy_btc(buy_value)
                    if order:
                        trade_direction = 'buy_btc'
                        trade_amount = order.quantity
                        cex_order_id = order.order_id
                else:
                    # BTC is overweight, sell BTC
                    sell_amount = (btc_ratio - target_ratio) * balances.btc
                    order = await self.cex.market_sell_btc(sell_amount)
                    if order:
                        trade_direction = 'sell_btc'
                        trade_amount = order.quantity
                        cex_order_id = order.order_id
            except Exception as e:
                status = 'failed'
                error_message = str(e)
        
        # Get updated balances
        new_balances = await self.cex.get_balances()
        
        # Create rebalance log
        log = RebalanceLog(
            trigger_type=trigger,
            btc_before=btc_before,
            usdt_before=usdt_before,
            btc_after=new_balances.btc,
            usdt_after=new_balances.usdt,
            trade_direction=trade_direction,
            trade_amount=trade_amount,
            cex_order_id=cex_order_id,
            btc_price=btc_price,
            status=status,
            error_message=error_message,
        )
        self.db.add(log)
        
        # Refresh quotas
        await self.refresh_quotas()
        
        # Create reserve snapshot
        await self.create_snapshot()
        
        await self.db.flush()
        return log
    
    async def refresh_quotas(self) -> None:
        '''Refresh exchange quotas based on current CEX balances.'''
        balances = await self.cex.get_balances()
        btc_price = await self.cex.get_btc_price()
        usage_ratio = Decimal(str(self.settings.reserve_usage_ratio))
        
        # Deactivate old quotas
        await self.db.execute(
            update(ExchangeQuota)
            .where(ExchangeQuota.is_active == True)
            .values(is_active=False)
        )
        
        # Buy sat quota = BTC reserve * price * 80% (in USDT, 6 decimals)
        buy_sat_amount = int(balances.btc * btc_price * usage_ratio * Decimal('1000000'))
        
        # Sell sat quota = USDT reserve * 80% / price (in sat)
        sell_sat_amount = int(balances.usdt * usage_ratio / btc_price * Decimal('100000000'))
        
        now = datetime.utcnow()
        expires_at = now + timedelta(hours=24)
        
        # Create new quotas
        buy_quota = ExchangeQuota(
            direction=ExchangeDirection.BUY_SAT.value,
            initial_amount=buy_sat_amount,
            remaining_amount=buy_sat_amount,
            btc_price_at_init=btc_price,
            created_at=now,
            expires_at=expires_at,
            is_active=True,
        )
        
        sell_quota = ExchangeQuota(
            direction=ExchangeDirection.SELL_SAT.value,
            initial_amount=sell_sat_amount,
            remaining_amount=sell_sat_amount,
            btc_price_at_init=btc_price,
            created_at=now,
            expires_at=expires_at,
            is_active=True,
        )
        
        self.db.add(buy_quota)
        self.db.add(sell_quota)
        await self.db.flush()
    
    async def get_active_quota(self, direction: str) -> Optional[ExchangeQuota]:
        '''Get the active quota for a direction.'''
        result = await self.db.execute(
            select(ExchangeQuota)
            .where(ExchangeQuota.direction == direction)
            .where(ExchangeQuota.is_active == True)
            .where(ExchangeQuota.expires_at > datetime.utcnow())
        )
        return result.scalar_one_or_none()
    
    async def deduct_quota(self, direction: str, amount: int) -> bool:
        '''Deduct from quota. Returns True if successful.'''
        quota = await self.get_active_quota(direction)
        if not quota:
            # Initialize quotas if not exist
            await self.refresh_quotas()
            quota = await self.get_active_quota(direction)
        
        if not quota or quota.remaining_amount < amount:
            return False
        
        quota.remaining_amount -= amount
        
        # Check if quota is low and trigger rebalance
        trigger_ratio = Decimal(str(self.settings.quota_trigger_ratio))
        if quota.remaining_amount < quota.initial_amount * trigger_ratio:
            await self.check_and_rebalance('quota_low')
        
        return True
    
    async def create_snapshot(self) -> ReserveSnapshot:
        '''Create a snapshot of current reserve state.'''
        balances = await self.cex.get_balances()
        btc_price = await self.cex.get_btc_price()
        
        btc_value = balances.btc * btc_price
        total_value = btc_value + balances.usdt
        btc_ratio = btc_value / total_value if total_value > 0 else Decimal('0')
        
        buy_quota = await self.get_active_quota(ExchangeDirection.BUY_SAT.value)
        sell_quota = await self.get_active_quota(ExchangeDirection.SELL_SAT.value)
        
        snapshot = ReserveSnapshot(
            btc_balance=balances.btc,
            usdt_balance=balances.usdt,
            btc_price=btc_price,
            total_value_usd=total_value,
            btc_ratio=btc_ratio,
            buy_sat_quota_remaining=buy_quota.remaining_amount if buy_quota else 0,
            sell_sat_quota_remaining=sell_quota.remaining_amount if sell_quota else 0,
        )
        self.db.add(snapshot)
        await self.db.flush()
        return snapshot
    
    async def get_quota_status(self) -> dict:
        '''Get current quota status for API response.'''
        buy_quota = await self.get_active_quota(ExchangeDirection.BUY_SAT.value)
        sell_quota = await self.get_active_quota(ExchangeDirection.SELL_SAT.value)
        btc_price = await self.cex.get_btc_price()
        
        return {
            'btc_price': float(btc_price),
            'buy_sat': {
                'initial': buy_quota.initial_amount if buy_quota else 0,
                'remaining': buy_quota.remaining_amount if buy_quota else 0,
                'remaining_usd': (buy_quota.remaining_amount / 1_000_000) if buy_quota else 0,
            },
            'sell_sat': {
                'initial': sell_quota.initial_amount if sell_quota else 0,
                'remaining': sell_quota.remaining_amount if sell_quota else 0,
                'remaining_usd': (sell_quota.remaining_amount * float(btc_price) / 100_000_000) if sell_quota else 0,
            },
        }
