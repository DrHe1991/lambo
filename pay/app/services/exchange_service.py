from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.exchange import (
    ExchangeQuota,
    ExchangePreview,
    Exchange,
    ExchangeDirection,
    ExchangeStatus,
)
from app.models.wallet import Wallet, WalletBalance
from app.models.ledger import PayLedger, LedgerAction
from app.services.cex_client import get_cex_client
from app.services.rebalance_service import RebalanceService


class QuotaExceeded(Exception):
    '''Raised when exchange amount exceeds available quota.'''
    def __init__(self, available: int, requested: int):
        self.available = available
        self.requested = requested
        super().__init__(f'Quota exceeded: requested {requested}, available {available}')


class PreviewExpired(Exception):
    '''Raised when trying to confirm an expired preview.'''
    pass


class PreviewNotFound(Exception):
    '''Raised when preview ID is not found.'''
    pass


class InsufficientBalance(Exception):
    '''Raised when user doesn't have enough balance.'''
    pass


class ExchangeService:
    '''Handles USDT <-> sat exchanges.'''
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.cex = get_cex_client()
        self.settings = get_settings()
        self.rebalance_service = RebalanceService(db)
    
    async def create_preview(
        self,
        wallet_id: int,
        amount: int,
        direction: str,
        include_bonus: bool = False,
        is_first_exchange: bool = False,
    ) -> ExchangePreview:
        '''Create a 30-second valid exchange preview.'''
        # Ensure quotas exist
        quota = await self.rebalance_service.get_active_quota(direction)
        if not quota:
            await self.rebalance_service.refresh_quotas()
            quota = await self.rebalance_service.get_active_quota(direction)
        
        if not quota:
            raise QuotaExceeded(available=0, requested=amount)
        
        if amount > quota.remaining_amount:
            raise QuotaExceeded(available=quota.remaining_amount, requested=amount)
        
        btc_price = await self.cex.get_btc_price()
        buffer_rate = Decimal(str(self.settings.exchange_buffer_rate))
        
        if direction == ExchangeDirection.BUY_SAT.value:
            # amount is USDT (6 decimals), output is sat
            usdt_amount = Decimal(amount) / Decimal('1000000')  # Convert to USDT
            sat_out = int(usdt_amount / btc_price * Decimal('100000000') * (1 - buffer_rate))
            amount_out = sat_out
        else:
            # amount is sat, output is USDT (6 decimals)
            sat_amount = Decimal(amount)
            usdt_out = sat_amount * btc_price / Decimal('100000000') * (1 - buffer_rate)
            amount_out = int(usdt_out * Decimal('1000000'))
        
        # Calculate first exchange bonus
        bonus_sat = 0
        if include_bonus and is_first_exchange and direction == ExchangeDirection.BUY_SAT.value:
            usdt_amount = Decimal(amount) / Decimal('1000000')
            bonus_cap = Decimal(str(self.settings.first_exchange_bonus_cap_usd))
            bonus_rate = Decimal(str(self.settings.first_exchange_bonus_rate))
            
            bonus_base = min(usdt_amount, bonus_cap)
            bonus_usd = bonus_base * bonus_rate
            bonus_sat = int(bonus_usd / btc_price * Decimal('100000000'))
        
        now = datetime.utcnow()
        preview = ExchangePreview(
            id=str(uuid4()),
            wallet_id=wallet_id,
            direction=direction,
            amount_in=amount,
            amount_out=amount_out,
            btc_price=btc_price,
            buffer_rate=buffer_rate,
            bonus_sat=bonus_sat,
            status=ExchangeStatus.PENDING.value,
            created_at=now,
            expires_at=now + timedelta(seconds=30),
        )
        
        self.db.add(preview)
        await self.db.flush()
        return preview
    
    async def confirm_exchange(self, preview_id: str, wallet_id: int) -> Exchange:
        '''Confirm and execute an exchange from a preview.'''
        # Get preview
        result = await self.db.execute(
            select(ExchangePreview).where(ExchangePreview.id == preview_id)
        )
        preview = result.scalar_one_or_none()
        
        if not preview:
            raise PreviewNotFound()
        
        if preview.wallet_id != wallet_id:
            raise PreviewNotFound()
        
        if preview.status != ExchangeStatus.PENDING.value:
            raise PreviewExpired()
        
        if preview.expires_at < datetime.utcnow():
            preview.status = ExchangeStatus.EXPIRED.value
            raise PreviewExpired()
        
        # Check and update balances
        if preview.direction == ExchangeDirection.BUY_SAT.value:
            # Deduct USDT, add sat
            await self._deduct_token_balance(wallet_id, 'USDT', preview.amount_in)
            await self._add_token_balance(wallet_id, 'SAT', preview.amount_out + preview.bonus_sat)
        else:
            # Deduct sat, add USDT
            await self._deduct_token_balance(wallet_id, 'SAT', preview.amount_in)
            await self._add_token_balance(wallet_id, 'USDT', preview.amount_out)
        
        # Deduct from quota
        success = await self.rebalance_service.deduct_quota(
            preview.direction, preview.amount_in
        )
        if not success:
            raise QuotaExceeded(available=0, requested=preview.amount_in)
        
        # Mark preview as confirmed
        preview.status = ExchangeStatus.CONFIRMED.value
        
        # Calculate buffer fee
        if preview.direction == ExchangeDirection.BUY_SAT.value:
            # Fee in sat
            gross_sat = int(
                Decimal(preview.amount_in) / Decimal('1000000') / preview.btc_price 
                * Decimal('100000000')
            )
            buffer_fee = gross_sat - preview.amount_out
        else:
            # Fee in USDT (6 decimals)
            gross_usdt = int(
                Decimal(preview.amount_in) * preview.btc_price 
                / Decimal('100000000') * Decimal('1000000')
            )
            buffer_fee = gross_usdt - preview.amount_out
        
        # Create exchange record
        exchange = Exchange(
            wallet_id=wallet_id,
            preview_id=preview_id,
            direction=preview.direction,
            amount_in=preview.amount_in,
            amount_out=preview.amount_out,
            btc_price=preview.btc_price,
            buffer_fee=buffer_fee,
            bonus_sat=preview.bonus_sat,
        )
        
        self.db.add(exchange)
        
        # Create ledger entries
        if preview.direction == ExchangeDirection.BUY_SAT.value:
            await self._create_ledger_entry(
                wallet_id, -preview.amount_in,
                LedgerAction.EXCHANGE_OUT.value,
                'exchange', exchange.id,
                f'Exchange {preview.amount_in / 1_000_000:.2f} USDT to sat'
            )
            total_sat = preview.amount_out + preview.bonus_sat
            await self._create_ledger_entry(
                wallet_id, total_sat,
                LedgerAction.EXCHANGE_IN.value,
                'exchange', exchange.id,
                f'Received {total_sat} sat from exchange'
            )
            if preview.bonus_sat > 0:
                await self._create_ledger_entry(
                    wallet_id, preview.bonus_sat,
                    LedgerAction.EXCHANGE_BONUS.value,
                    'exchange', exchange.id,
                    f'First exchange bonus: {preview.bonus_sat} sat'
                )
        else:
            await self._create_ledger_entry(
                wallet_id, -preview.amount_in,
                LedgerAction.EXCHANGE_OUT.value,
                'exchange', exchange.id,
                f'Exchange {preview.amount_in} sat to USDT'
            )
            await self._create_ledger_entry(
                wallet_id, preview.amount_out,
                LedgerAction.EXCHANGE_IN.value,
                'exchange', exchange.id,
                f'Received {preview.amount_out / 1_000_000:.2f} USDT from exchange'
            )
        
        await self.db.flush()
        return exchange
    
    async def _get_or_create_balance(
        self, wallet_id: int, token_symbol: str
    ) -> WalletBalance:
        '''Get or create a wallet balance record.'''
        result = await self.db.execute(
            select(WalletBalance)
            .where(WalletBalance.wallet_id == wallet_id)
            .where(WalletBalance.token_symbol == token_symbol)
        )
        balance = result.scalar_one_or_none()
        
        if not balance:
            balance = WalletBalance(
                wallet_id=wallet_id,
                token_symbol=token_symbol,
                balance=0,
                locked_balance=0,
            )
            self.db.add(balance)
            await self.db.flush()
        
        return balance
    
    async def _deduct_token_balance(
        self, wallet_id: int, token_symbol: str, amount: int
    ) -> None:
        '''Deduct from token balance.'''
        balance = await self._get_or_create_balance(wallet_id, token_symbol)
        available = balance.balance - balance.locked_balance
        
        if available < amount:
            raise InsufficientBalance(
                f'Need {amount} {token_symbol} but only have {available}'
            )
        
        balance.balance -= amount
    
    async def _add_token_balance(
        self, wallet_id: int, token_symbol: str, amount: int
    ) -> None:
        '''Add to token balance.'''
        balance = await self._get_or_create_balance(wallet_id, token_symbol)
        balance.balance += amount
    
    async def _create_ledger_entry(
        self,
        wallet_id: int,
        amount: int,
        action: str,
        ref_type: str,
        ref_id: int,
        description: str,
    ) -> PayLedger:
        '''Create a ledger entry.'''
        # Get current balance for balance_after
        result = await self.db.execute(
            select(Wallet).where(Wallet.id == wallet_id)
        )
        wallet = result.scalar_one()
        
        entry = PayLedger(
            wallet_id=wallet_id,
            amount=amount,
            balance_after=wallet.balance,  # This is legacy, we use token balances now
            action=action,
            ref_type=ref_type,
            ref_id=ref_id,
            description=description,
        )
        self.db.add(entry)
        return entry
    
    async def get_exchange_history(
        self, wallet_id: int, limit: int = 20, offset: int = 0
    ) -> list[Exchange]:
        '''Get exchange history for a wallet.'''
        result = await self.db.execute(
            select(Exchange)
            .where(Exchange.wallet_id == wallet_id)
            .order_by(Exchange.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())
