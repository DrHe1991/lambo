from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from decimal import Decimal

from app.db.database import get_db
from app.config import get_settings
from app.services.exchange_service import (
    ExchangeService,
    QuotaExceeded,
    PreviewExpired,
    PreviewNotFound,
    InsufficientBalance,
)
from app.services.rebalance_service import RebalanceService
from app.services.cex_client import get_cex_client


router = APIRouter()


class ExchangePreviewRequest(BaseModel):
    wallet_id: int
    amount: int  # USDT (6 decimals) for buy_sat, sat for sell_sat
    direction: str  # 'buy_sat' or 'sell_sat'
    include_bonus: bool = False
    is_first_exchange: bool = False


class ExchangePreviewResponse(BaseModel):
    preview_id: str
    wallet_id: int
    direction: str
    amount_in: int
    amount_out: int
    btc_price: float
    buffer_rate: float
    bonus_sat: int
    total_out: int  # amount_out + bonus_sat
    expires_in_seconds: int


class ExchangeConfirmRequest(BaseModel):
    preview_id: str
    wallet_id: int


class ExchangeResponse(BaseModel):
    id: int
    wallet_id: int
    direction: str
    amount_in: int
    amount_out: int
    btc_price: float
    buffer_fee: int
    bonus_sat: int
    created_at: str


class QuotaStatusResponse(BaseModel):
    btc_price: float
    buy_sat: dict
    sell_sat: dict


class ChainFeeResponse(BaseModel):
    chain: str
    min_deposit: float
    network_fee: float
    enabled: bool
    receive_amount: float  # For $5 deposit


class RebalanceRequest(BaseModel):
    trigger: str = 'manual'


@router.post('/preview', response_model=ExchangePreviewResponse)
async def create_exchange_preview(
    request: ExchangePreviewRequest,
    db: AsyncSession = Depends(get_db),
):
    '''Create a 30-second valid exchange preview.'''
    try:
        service = ExchangeService(db)
        preview = await service.create_preview(
            wallet_id=request.wallet_id,
            amount=request.amount,
            direction=request.direction,
            include_bonus=request.include_bonus,
            is_first_exchange=request.is_first_exchange,
        )
        await db.commit()
        
        from datetime import datetime
        expires_in = int((preview.expires_at - datetime.utcnow()).total_seconds())
        
        return ExchangePreviewResponse(
            preview_id=preview.id,
            wallet_id=preview.wallet_id,
            direction=preview.direction,
            amount_in=preview.amount_in,
            amount_out=preview.amount_out,
            btc_price=float(preview.btc_price),
            buffer_rate=float(preview.buffer_rate),
            bonus_sat=preview.bonus_sat,
            total_out=preview.amount_out + preview.bonus_sat,
            expires_in_seconds=max(0, expires_in),
        )
    except QuotaExceeded as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                'error': 'quota_exceeded',
                'available': e.available,
                'requested': e.requested,
            },
        )


@router.post('/confirm', response_model=ExchangeResponse)
async def confirm_exchange(
    request: ExchangeConfirmRequest,
    db: AsyncSession = Depends(get_db),
):
    '''Confirm and execute an exchange from a preview.'''
    try:
        service = ExchangeService(db)
        exchange = await service.confirm_exchange(
            preview_id=request.preview_id,
            wallet_id=request.wallet_id,
        )
        await db.commit()
        
        return ExchangeResponse(
            id=exchange.id,
            wallet_id=exchange.wallet_id,
            direction=exchange.direction,
            amount_in=exchange.amount_in,
            amount_out=exchange.amount_out,
            btc_price=float(exchange.btc_price),
            buffer_fee=exchange.buffer_fee,
            bonus_sat=exchange.bonus_sat,
            created_at=exchange.created_at.isoformat(),
        )
    except PreviewNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Preview not found',
        )
    except PreviewExpired:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Preview expired',
        )
    except InsufficientBalance as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except QuotaExceeded as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                'error': 'quota_exceeded',
                'available': e.available,
            },
        )


@router.get('/quota', response_model=QuotaStatusResponse)
async def get_quota_status(db: AsyncSession = Depends(get_db)):
    '''Get current exchange quota status.'''
    service = RebalanceService(db)
    status = await service.get_quota_status()
    return QuotaStatusResponse(**status)


@router.get('/price')
async def get_btc_price():
    '''Get current BTC price.'''
    cex = get_cex_client()
    price = await cex.get_btc_price()
    return {'btc_price': float(price)}


@router.get('/chain-fees', response_model=list[ChainFeeResponse])
async def get_chain_fees():
    '''Get network fees and minimum deposits per chain.'''
    settings = get_settings()
    chains = []
    
    for chain, config in settings.chain_configs.items():
        # Calculate receive amount for minimum deposit
        receive = config['min_deposit'] - config['network_fee']
        
        chains.append(ChainFeeResponse(
            chain=chain,
            min_deposit=config['min_deposit'],
            network_fee=config['network_fee'],
            enabled=config.get('enabled', False),
            receive_amount=max(0, receive),
        ))
    
    return chains


@router.get('/history')
async def get_exchange_history(
    wallet_id: int = Query(...),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    '''Get exchange history for a wallet.'''
    service = ExchangeService(db)
    exchanges = await service.get_exchange_history(wallet_id, limit, offset)
    
    return {
        'exchanges': [
            {
                'id': ex.id,
                'direction': ex.direction,
                'amount_in': ex.amount_in,
                'amount_out': ex.amount_out,
                'btc_price': float(ex.btc_price),
                'buffer_fee': ex.buffer_fee,
                'bonus_sat': ex.bonus_sat,
                'created_at': ex.created_at.isoformat(),
            }
            for ex in exchanges
        ]
    }


@router.post('/rebalance')
async def trigger_rebalance(
    request: RebalanceRequest,
    db: AsyncSession = Depends(get_db),
):
    '''Manually trigger a reserve rebalance (admin only).'''
    service = RebalanceService(db)
    log = await service.check_and_rebalance(request.trigger)
    await db.commit()
    
    if log:
        return {
            'status': log.status,
            'trade_direction': log.trade_direction,
            'trade_amount': float(log.trade_amount) if log.trade_amount else None,
            'btc_before': float(log.btc_before),
            'btc_after': float(log.btc_after),
            'usdt_before': float(log.usdt_before),
            'usdt_after': float(log.usdt_after),
        }
    
    return {'status': 'skipped', 'reason': 'No rebalance needed'}
