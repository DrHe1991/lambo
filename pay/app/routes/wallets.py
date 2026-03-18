from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import App, Wallet, WalletBalance, DepositAddress, PayLedger, Chain
from app.schemas.wallet import (
    WalletCreate,
    WalletResponse,
    WalletBalances,
    TokenBalance,
    DepositAddressResponse,
)
from app.schemas.ledger import LedgerEntryResponse
from app.services.hd_wallet import HDWalletService, TestWalletService
from app.config import get_settings

router = APIRouter()

# Token decimals mapping
TOKEN_DECIMALS = {
    'TRX': 6,
    'USDT': 6,
    'USDC': 6,
    'ETH': 18,
    'BTC': 8,
    'SAT': 0,
}


def format_amount(amount: int, decimals: int = 6) -> str:
    """Format amount with proper decimal places."""
    if amount == 0:
        return '0' if decimals == 0 else '0.00'
    sign = '-' if amount < 0 else ''
    abs_amount = abs(amount)
    if decimals == 0:
        return f'{sign}{abs_amount}'
    integer_part = abs_amount // (10 ** decimals)
    decimal_part = abs_amount % (10 ** decimals)
    return f'{sign}{integer_part}.{str(decimal_part).zfill(decimals)[:2]}'


@router.post('', response_model=WalletResponse, status_code=status.HTTP_201_CREATED)
async def create_wallet(
    data: WalletCreate,
    app_id: int = Query(..., description='App ID'),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new wallet for a user within an app.
    
    Each app+user combination can only have one wallet.
    """
    # Verify app exists
    app_result = await db.execute(select(App).where(App.id == app_id))
    app = app_result.scalar_one_or_none()
    
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='App not found',
        )
    
    if not app.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='App is not active',
        )
    
    # Check if wallet already exists
    existing = await db.execute(
        select(Wallet).where(
            Wallet.app_id == app_id,
            Wallet.external_user_id == data.external_user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Wallet already exists for this user',
        )
    
    wallet = Wallet(
        app_id=app_id,
        external_user_id=data.external_user_id,
    )
    
    db.add(wallet)
    await db.commit()
    await db.refresh(wallet)
    
    return wallet


@router.get('/{wallet_id}', response_model=WalletResponse)
async def get_wallet(
    wallet_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get wallet details."""
    result = await db.execute(select(Wallet).where(Wallet.id == wallet_id))
    wallet = result.scalar_one_or_none()
    
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Wallet not found',
        )
    
    return wallet


@router.get('/{wallet_id}/balance', response_model=WalletBalances)
async def get_wallet_balance(
    wallet_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get wallet balances per token."""
    # Verify wallet exists
    wallet_result = await db.execute(select(Wallet).where(Wallet.id == wallet_id))
    wallet = wallet_result.scalar_one_or_none()
    
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Wallet not found',
        )
    
    # Get all token balances
    balances_result = await db.execute(
        select(WalletBalance).where(WalletBalance.wallet_id == wallet_id)
    )
    token_balances = balances_result.scalars().all()
    
    return WalletBalances(
        wallet_id=wallet.id,
        balances=[
            TokenBalance(
                token_symbol=tb.token_symbol,
                token_contract=tb.token_contract,
                balance=tb.balance,
                locked_balance=tb.locked_balance,
                available_balance=tb.balance - tb.locked_balance,
                balance_formatted=format_amount(
                    tb.balance, 
                    TOKEN_DECIMALS.get(tb.token_symbol, 6)
                ),
                decimals=TOKEN_DECIMALS.get(tb.token_symbol, 6),
            )
            for tb in token_balances
        ],
    )


@router.get('/{wallet_id}/address', response_model=DepositAddressResponse)
async def get_or_create_deposit_address(
    wallet_id: int,
    chain: str = Query(default='tron', description='Blockchain network'),
    db: AsyncSession = Depends(get_db),
):
    """
    Get or create a deposit address for the wallet.
    
    If an address already exists for the chain, returns it.
    Otherwise, derives a new HD address and stores it.
    """
    # Verify wallet exists
    wallet_result = await db.execute(select(Wallet).where(Wallet.id == wallet_id))
    wallet = wallet_result.scalar_one_or_none()
    
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Wallet not found',
        )
    
    # Check if address already exists
    existing = await db.execute(
        select(DepositAddress).where(
            DepositAddress.wallet_id == wallet_id,
            DepositAddress.chain == chain,
        )
    )
    existing_addr = existing.scalar_one_or_none()
    
    if existing_addr:
        return existing_addr
    
    # Get next derivation index
    max_index_result = await db.execute(
        select(func.max(DepositAddress.derivation_index)).where(
            DepositAddress.chain == chain
        )
    )
    max_index = max_index_result.scalar() or -1
    next_index = max_index + 1
    
    # Derive new address
    settings = get_settings()
    
    if settings.tron_xpub:
        hd_service = HDWalletService(settings.tron_xpub)
        address = hd_service.derive_address(next_index)
    else:
        # Use test wallet for development
        test_service = TestWalletService()
        address_info = test_service.derive_address(next_index)
        address = address_info['address']
    
    # Create deposit address record
    deposit_address = DepositAddress(
        wallet_id=wallet_id,
        chain=chain,
        address=address,
        derivation_index=next_index,
    )
    
    db.add(deposit_address)
    await db.commit()
    await db.refresh(deposit_address)
    
    return deposit_address


@router.get('/{wallet_id}/ledger', response_model=list[LedgerEntryResponse])
async def get_wallet_ledger(
    wallet_id: int,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get wallet transaction history (ledger entries)."""
    # Verify wallet exists
    wallet_result = await db.execute(select(Wallet).where(Wallet.id == wallet_id))
    wallet = wallet_result.scalar_one_or_none()
    
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Wallet not found',
        )
    
    result = await db.execute(
        select(PayLedger)
        .where(PayLedger.wallet_id == wallet_id)
        .order_by(PayLedger.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    entries = result.scalars().all()
    
    return [
        LedgerEntryResponse(
            id=entry.id,
            wallet_id=entry.wallet_id,
            amount=entry.amount,
            amount_formatted=format_amount(entry.amount),
            balance_after=entry.balance_after,
            balance_after_formatted=format_amount(entry.balance_after),
            action=entry.action,
            ref_type=entry.ref_type,
            ref_id=entry.ref_id,
            description=entry.description,
            created_at=entry.created_at,
        )
        for entry in entries
    ]
