from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import Wallet, Withdrawal, PayLedger, LedgerAction, WithdrawalStatus
from app.schemas import WithdrawalCreate, WithdrawalResponse
from app.services.tron_service import get_tron_service

router = APIRouter()


def format_amount(amount: int, decimals: int = 6) -> str:
    """Format amount with proper decimal places."""
    if amount == 0:
        return '0.00'
    sign = '-' if amount < 0 else ''
    abs_amount = abs(amount)
    integer_part = abs_amount // (10 ** decimals)
    decimal_part = abs_amount % (10 ** decimals)
    return f'{sign}{integer_part}.{str(decimal_part).zfill(decimals)[:2]}'


@router.post('/wallet/{wallet_id}', response_model=WithdrawalResponse, status_code=status.HTTP_201_CREATED)
async def create_withdrawal(
    wallet_id: int,
    data: WithdrawalCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a withdrawal request.
    
    The withdrawal will be processed by the background worker.
    Funds are locked immediately and debited when confirmed.
    """
    # Verify wallet exists
    wallet_result = await db.execute(select(Wallet).where(Wallet.id == wallet_id))
    wallet = wallet_result.scalar_one_or_none()
    
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Wallet not found',
        )
    
    # Validate destination address
    if data.chain == 'tron':
        tron_service = get_tron_service()
        is_valid = await tron_service.validate_address(data.to_address)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Invalid TRON address',
            )
    
    # Check available balance
    available = wallet.balance - wallet.locked_balance
    if data.amount > available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Insufficient balance. Available: {format_amount(available)}',
        )
    
    # Lock funds
    wallet.locked_balance += data.amount
    
    # Create withdrawal record
    withdrawal = Withdrawal(
        wallet_id=wallet_id,
        chain=data.chain,
        to_address=data.to_address,
        token_symbol=data.token_symbol,
        amount=data.amount,
        status=WithdrawalStatus.PENDING.value,
    )
    
    db.add(withdrawal)
    await db.commit()
    await db.refresh(withdrawal)
    
    return WithdrawalResponse(
        id=withdrawal.id,
        wallet_id=withdrawal.wallet_id,
        chain=withdrawal.chain,
        to_address=withdrawal.to_address,
        token_symbol=withdrawal.token_symbol,
        amount=withdrawal.amount,
        amount_formatted=format_amount(withdrawal.amount),
        fee=withdrawal.fee,
        status=withdrawal.status,
        tx_hash=withdrawal.tx_hash,
        error_message=withdrawal.error_message,
        created_at=withdrawal.created_at,
        processed_at=withdrawal.processed_at,
        confirmed_at=withdrawal.confirmed_at,
    )


@router.get('/wallet/{wallet_id}', response_model=list[WithdrawalResponse])
async def list_withdrawals(
    wallet_id: int,
    status_filter: str = Query(default=None, alias='status'),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List withdrawals for a wallet."""
    # Verify wallet exists
    wallet_result = await db.execute(select(Wallet).where(Wallet.id == wallet_id))
    wallet = wallet_result.scalar_one_or_none()
    
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Wallet not found',
        )
    
    # Build query
    query = select(Withdrawal).where(Withdrawal.wallet_id == wallet_id)
    
    if status_filter:
        query = query.where(Withdrawal.status == status_filter)
    
    query = query.order_by(Withdrawal.created_at.desc()).limit(limit).offset(offset)
    
    result = await db.execute(query)
    withdrawals = result.scalars().all()
    
    return [
        WithdrawalResponse(
            id=w.id,
            wallet_id=w.wallet_id,
            chain=w.chain,
            to_address=w.to_address,
            token_symbol=w.token_symbol,
            amount=w.amount,
            amount_formatted=format_amount(w.amount),
            fee=w.fee,
            status=w.status,
            tx_hash=w.tx_hash,
            error_message=w.error_message,
            created_at=w.created_at,
            processed_at=w.processed_at,
            confirmed_at=w.confirmed_at,
        )
        for w in withdrawals
    ]


@router.get('/{withdrawal_id}', response_model=WithdrawalResponse)
async def get_withdrawal(
    withdrawal_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get withdrawal details by ID."""
    result = await db.execute(select(Withdrawal).where(Withdrawal.id == withdrawal_id))
    withdrawal = result.scalar_one_or_none()
    
    if not withdrawal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Withdrawal not found',
        )
    
    return WithdrawalResponse(
        id=withdrawal.id,
        wallet_id=withdrawal.wallet_id,
        chain=withdrawal.chain,
        to_address=withdrawal.to_address,
        token_symbol=withdrawal.token_symbol,
        amount=withdrawal.amount,
        amount_formatted=format_amount(withdrawal.amount),
        fee=withdrawal.fee,
        status=withdrawal.status,
        tx_hash=withdrawal.tx_hash,
        error_message=withdrawal.error_message,
        created_at=withdrawal.created_at,
        processed_at=withdrawal.processed_at,
        confirmed_at=withdrawal.confirmed_at,
    )


@router.post('/{withdrawal_id}/cancel', response_model=WithdrawalResponse)
async def cancel_withdrawal(
    withdrawal_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel a pending withdrawal.
    
    Only withdrawals in PENDING status can be cancelled.
    """
    result = await db.execute(select(Withdrawal).where(Withdrawal.id == withdrawal_id))
    withdrawal = result.scalar_one_or_none()
    
    if not withdrawal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Withdrawal not found',
        )
    
    if withdrawal.status != WithdrawalStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Cannot cancel withdrawal in {withdrawal.status} status',
        )
    
    # Get wallet and unlock funds
    wallet_result = await db.execute(select(Wallet).where(Wallet.id == withdrawal.wallet_id))
    wallet = wallet_result.scalar_one()
    wallet.locked_balance -= withdrawal.amount
    
    # Update withdrawal status
    withdrawal.status = WithdrawalStatus.CANCELLED.value
    
    await db.commit()
    await db.refresh(withdrawal)
    
    return WithdrawalResponse(
        id=withdrawal.id,
        wallet_id=withdrawal.wallet_id,
        chain=withdrawal.chain,
        to_address=withdrawal.to_address,
        token_symbol=withdrawal.token_symbol,
        amount=withdrawal.amount,
        amount_formatted=format_amount(withdrawal.amount),
        fee=withdrawal.fee,
        status=withdrawal.status,
        tx_hash=withdrawal.tx_hash,
        error_message=withdrawal.error_message,
        created_at=withdrawal.created_at,
        processed_at=withdrawal.processed_at,
        confirmed_at=withdrawal.confirmed_at,
    )
