"""
Deposit monitoring service for TRON blockchain.

Polls the blockchain for new deposits to monitored addresses
and updates the database accordingly.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal
from app.models import (
    DepositAddress,
    Deposit,
    Wallet,
    WalletBalance,
    PayLedger,
    DepositStatus,
    LedgerAction,
)
from app.services.tron_service import TronService, get_tron_service, USDT_CONTRACTS
from app.config import get_settings

logger = logging.getLogger(__name__)


class DepositMonitor:
    """Background service to monitor blockchain deposits."""
    
    def __init__(self):
        self.settings = get_settings()
        self.tron_service: Optional[TronService] = None
        self.running = False
        self._task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the deposit monitoring loop."""
        if self.running:
            logger.warning('Deposit monitor already running')
            return
        
        self.running = True
        self.tron_service = get_tron_service()
        self._task = asyncio.create_task(self._monitor_loop())
        logger.info(f'Deposit monitor started (network: {self.settings.tron_network})')
    
    async def stop(self):
        """Stop the deposit monitoring loop."""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info('Deposit monitor stopped')
    
    async def _monitor_loop(self):
        """Main monitoring loop."""
        while self.running:
            try:
                await self._check_deposits()
                await self._update_confirmations()
            except Exception as e:
                logger.error(f'Error in deposit monitor: {e}', exc_info=True)
            
            await asyncio.sleep(self.settings.deposit_poll_interval)
    
    async def _check_deposits(self):
        """Check for new deposits to all monitored addresses."""
        async with AsyncSessionLocal() as db:
            # Get all active deposit addresses for TRON
            result = await db.execute(
                select(DepositAddress).where(
                    DepositAddress.chain == 'tron',
                    DepositAddress.is_active == True,
                )
            )
            addresses = result.scalars().all()
            
            if not addresses:
                return
            
            logger.debug(f'Checking {len(addresses)} addresses for deposits')
            
            for addr in addresses:
                await self._check_address_deposits(db, addr)
    
    async def _check_address_deposits(
        self,
        db: AsyncSession,
        deposit_address: DepositAddress,
    ):
        """Check for new TRC-20 and TRX deposits to a specific address."""
        try:
            # 1. Check TRX native transfers
            await self._check_trx_transfers(db, deposit_address)
            
            # 2. Check TRC-20 (USDT) transfers
            await self._check_trc20_transfers(db, deposit_address)
        
        except Exception as e:
            logger.error(f'Error checking deposits for {deposit_address.address}: {e}')
    
    async def _check_trx_transfers(
        self,
        db: AsyncSession,
        deposit_address: DepositAddress,
    ):
        """Check for TRX native transfers."""
        # Only check transactions from the last hour to avoid processing old history
        import time
        min_timestamp = (int(time.time()) - 3600) * 1000  # 1 hour ago in ms
        
        transfers = await self.tron_service.get_trx_transfers(
            address=deposit_address.address,
            min_timestamp=min_timestamp,
            limit=20,
        )
        
        current_block = await self.tron_service.get_current_block()
        
        for transfer in transfers:
            # Skip if already processed
            existing = await db.execute(
                select(Deposit).where(
                    Deposit.chain == 'tron',
                    Deposit.tx_hash == transfer.tx_hash,
                )
            )
            if existing.scalar_one_or_none():
                continue
            
            # Create new deposit record
            deposit = Deposit(
                wallet_id=deposit_address.wallet_id,
                deposit_address_id=deposit_address.id,
                chain='tron',
                tx_hash=transfer.tx_hash,
                block_number=transfer.block_number if transfer.block_number > 0 else current_block - 5,
                token_contract=None,
                token_symbol='TRX',
                amount=transfer.amount,
                from_address=transfer.from_address,
                confirmations=0,
                required_confirmations=self.settings.deposit_confirmations,
                status=DepositStatus.PENDING.value,
            )
            
            db.add(deposit)
            await db.commit()
            
            trx_amount = transfer.amount / 1_000_000
            logger.info(
                f'New TRX deposit detected: {trx_amount} TRX '
                f'to {deposit_address.address} (tx: {transfer.tx_hash[:16]}...)'
            )
    
    async def _check_trc20_transfers(
        self,
        db: AsyncSession,
        deposit_address: DepositAddress,
    ):
        """Check for TRC-20 (USDT) transfers."""
        import time
        min_timestamp = (int(time.time()) - 3600) * 1000  # 1 hour ago in ms
        
        usdt_contract = USDT_CONTRACTS.get(self.settings.tron_network, '')
        
        transfers = await self.tron_service.get_trc20_transfers(
            address=deposit_address.address,
            contract_address=usdt_contract if usdt_contract else None,
            min_timestamp=min_timestamp,
            limit=20,
        )
        
        for transfer in transfers:
            # Skip if already processed
            existing = await db.execute(
                select(Deposit).where(
                    Deposit.chain == 'tron',
                    Deposit.tx_hash == transfer.tx_hash,
                )
            )
            if existing.scalar_one_or_none():
                continue
            
            # Create new deposit record
            deposit = Deposit(
                wallet_id=deposit_address.wallet_id,
                deposit_address_id=deposit_address.id,
                chain='tron',
                tx_hash=transfer.tx_hash,
                block_number=transfer.block_number,
                token_contract=transfer.contract_address,
                token_symbol=transfer.token_symbol or 'USDT',
                amount=transfer.amount,
                from_address=transfer.from_address,
                confirmations=0,
                required_confirmations=self.settings.deposit_confirmations,
                status=DepositStatus.PENDING.value,
            )
            
            db.add(deposit)
            await db.commit()
            
            logger.info(
                f'New TRC-20 deposit detected: {transfer.amount} {transfer.token_symbol} '
                f'to {deposit_address.address} (tx: {transfer.tx_hash[:16]}...)'
            )
    
    async def _update_confirmations(self):
        """Update confirmation counts for pending deposits."""
        async with AsyncSessionLocal() as db:
            # Get current block number
            try:
                current_block = await self.tron_service.get_current_block()
            except Exception as e:
                logger.error(f'Failed to get current block: {e}')
                return
            
            # Get pending deposits
            result = await db.execute(
                select(Deposit).where(
                    Deposit.chain == 'tron',
                    Deposit.status.in_([
                        DepositStatus.PENDING.value,
                        DepositStatus.CONFIRMING.value,
                    ]),
                )
            )
            deposits = result.scalars().all()
            
            for deposit in deposits:
                confirmations = current_block - deposit.block_number
                if confirmations < 0:
                    confirmations = 0
                
                deposit.confirmations = confirmations
                
                if confirmations > 0 and deposit.status == DepositStatus.PENDING.value:
                    deposit.status = DepositStatus.CONFIRMING.value
                
                # Check if enough confirmations to credit
                if confirmations >= deposit.required_confirmations:
                    if deposit.status != DepositStatus.CONFIRMED.value:
                        await self._credit_deposit(db, deposit)
            
            await db.commit()
    
    async def _credit_deposit(self, db: AsyncSession, deposit: Deposit):
        """Credit a confirmed deposit to the wallet's token balance."""
        # Get or create token balance record
        balance_result = await db.execute(
            select(WalletBalance).where(
                WalletBalance.wallet_id == deposit.wallet_id,
                WalletBalance.token_symbol == deposit.token_symbol,
            )
        )
        token_balance = balance_result.scalar_one_or_none()
        
        if not token_balance:
            # Create new token balance record
            token_balance = WalletBalance(
                wallet_id=deposit.wallet_id,
                token_symbol=deposit.token_symbol,
                token_contract=deposit.token_contract,
                balance=0,
            )
            db.add(token_balance)
            await db.flush()
        
        # Update token balance
        token_balance.balance += deposit.amount
        new_balance = token_balance.balance
        
        # Create ledger entry
        ledger = PayLedger(
            wallet_id=deposit.wallet_id,
            amount=deposit.amount,
            balance_after=new_balance,
            action=LedgerAction.DEPOSIT.value,
            ref_type='deposit',
            ref_id=deposit.id,
            description=f'{deposit.token_symbol} deposit from {deposit.from_address[:8]}...',
        )
        db.add(ledger)
        
        # Mark deposit as confirmed
        deposit.status = DepositStatus.CONFIRMED.value
        deposit.credited_at = datetime.utcnow()
        
        logger.info(
            f'Credited deposit {deposit.id}: {deposit.amount} {deposit.token_symbol} '
            f'to wallet {deposit.wallet_id} (new {deposit.token_symbol} balance: {new_balance})'
        )


# Singleton instance
_monitor: Optional[DepositMonitor] = None


def get_deposit_monitor() -> DepositMonitor:
    """Get or create DepositMonitor singleton."""
    global _monitor
    if _monitor is None:
        _monitor = DepositMonitor()
    return _monitor


async def start_monitor():
    """Start the deposit monitor."""
    monitor = get_deposit_monitor()
    await monitor.start()


async def stop_monitor():
    """Stop the deposit monitor."""
    monitor = get_deposit_monitor()
    await monitor.stop()
