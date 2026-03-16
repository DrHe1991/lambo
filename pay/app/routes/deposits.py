from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import Wallet, Deposit
from app.schemas import DepositResponse, DepositList

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


@router.get('/wallet/{wallet_id}', response_model=DepositList)
async def list_deposits(
    wallet_id: int,
    status_filter: str = Query(default=None, alias='status'),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List deposits for a wallet."""
    # Verify wallet exists
    wallet_result = await db.execute(select(Wallet).where(Wallet.id == wallet_id))
    wallet = wallet_result.scalar_one_or_none()
    
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Wallet not found',
        )
    
    # Build query
    query = select(Deposit).where(Deposit.wallet_id == wallet_id)
    count_query = select(func.count(Deposit.id)).where(Deposit.wallet_id == wallet_id)
    
    if status_filter:
        query = query.where(Deposit.status == status_filter)
        count_query = count_query.where(Deposit.status == status_filter)
    
    query = query.order_by(Deposit.created_at.desc()).limit(limit).offset(offset)
    
    # Execute queries
    result = await db.execute(query)
    deposits = result.scalars().all()
    
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0
    
    return DepositList(
        deposits=[
            DepositResponse(
                id=d.id,
                wallet_id=d.wallet_id,
                chain=d.chain,
                tx_hash=d.tx_hash,
                block_number=d.block_number,
                token_symbol=d.token_symbol,
                amount=d.amount,
                amount_formatted=format_amount(d.amount),
                from_address=d.from_address,
                confirmations=d.confirmations,
                required_confirmations=d.required_confirmations,
                status=d.status,
                credited_at=d.credited_at,
                created_at=d.created_at,
            )
            for d in deposits
        ],
        total=total,
    )


@router.get('/{deposit_id}', response_model=DepositResponse)
async def get_deposit(
    deposit_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get deposit details by ID."""
    result = await db.execute(select(Deposit).where(Deposit.id == deposit_id))
    deposit = result.scalar_one_or_none()
    
    if not deposit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Deposit not found',
        )
    
    return DepositResponse(
        id=deposit.id,
        wallet_id=deposit.wallet_id,
        chain=deposit.chain,
        tx_hash=deposit.tx_hash,
        block_number=deposit.block_number,
        token_symbol=deposit.token_symbol,
        amount=deposit.amount,
        amount_formatted=format_amount(deposit.amount),
        from_address=deposit.from_address,
        confirmations=deposit.confirmations,
        required_confirmations=deposit.required_confirmations,
        status=deposit.status,
        credited_at=deposit.credited_at,
        created_at=deposit.created_at,
    )
