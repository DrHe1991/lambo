"""Routes for crypto payments via Pay service."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.user import User
from app.services.pay_client import get_pay_client, PayClient, PayClientError
from app.schemas.pay import (
    CryptoBalanceResponse,
    CryptoBalance,
    DepositAddressResponse,
    DepositsListResponse,
    DepositResponse,
    WithdrawalRequest,
    WithdrawalResponse,
    WithdrawalsListResponse,
)

router = APIRouter()


async def _ensure_pay_wallet(
    user: User,
    pay_client: PayClient,
    db: AsyncSession,
) -> int:
    """Ensure user has a Pay wallet, creating one if needed."""
    if user.pay_wallet_id:
        return user.pay_wallet_id

    wallet = await pay_client.get_or_create_wallet(str(user.id))
    user.pay_wallet_id = wallet['id']
    await db.flush()
    return user.pay_wallet_id


def _format_amount(amount: int, token_symbol: str) -> str:
    """Format amount for display."""
    if token_symbol == 'TRX':
        return f'{amount / 1_000_000:.6f} TRX'
    elif token_symbol == 'USDT':
        return f'{amount / 1_000_000:.2f} USDT'
    return f'{amount} {token_symbol}'


@router.get('/address', response_model=DepositAddressResponse)
async def get_deposit_address(
    user_id: int = Query(...),
    chain: str = Query('tron'),
    db: AsyncSession = Depends(get_db),
):
    """Get deposit address for the current user."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    pay_client = get_pay_client()

    try:
        wallet_id = await _ensure_pay_wallet(user, pay_client, db)
        address_data = await pay_client.get_deposit_address(wallet_id, chain)

        return DepositAddressResponse(
            chain=address_data['chain'],
            address=address_data['address'],
        )
    except PayClientError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get('/balance', response_model=CryptoBalanceResponse)
async def get_crypto_balance(
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get crypto balance for the user."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    pay_client = get_pay_client()

    try:
        wallet_id = await _ensure_pay_wallet(user, pay_client, db)
        balance_data = await pay_client.get_balance(wallet_id)

        balances = []
        for b in balance_data.get('balances', []):
            balances.append(CryptoBalance(
                token_symbol=b['token_symbol'],
                balance=b['balance'],
                balance_formatted=b.get('balance_formatted', _format_amount(
                    b['balance'], b['token_symbol']
                )),
            ))

        return CryptoBalanceResponse(balances=balances)
    except PayClientError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get('/deposits', response_model=DepositsListResponse)
async def get_deposits(
    user_id: int = Query(...),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get deposit history for the user."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    if not user.pay_wallet_id:
        return DepositsListResponse(deposits=[])

    pay_client = get_pay_client()

    try:
        deposits_response = await pay_client.get_deposits(user.pay_wallet_id, limit, offset)
        deposits_data = deposits_response.get('deposits', [])

        deposits = []
        for d in deposits_data:
            deposits.append(DepositResponse(
                id=d['id'],
                chain=d['chain'],
                tx_hash=d['tx_hash'],
                token_symbol=d['token_symbol'],
                amount=d['amount'],
                amount_formatted=d.get('amount_formatted', _format_amount(
                    d['amount'], d['token_symbol']
                )),
                status=d['status'],
                confirmations=d.get('confirmations', 0),
                created_at=d['created_at'],
            ))

        return DepositsListResponse(deposits=deposits)
    except PayClientError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post('/withdraw', response_model=WithdrawalResponse)
async def create_withdrawal(
    request: WithdrawalRequest,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Request a withdrawal."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    pay_client = get_pay_client()

    try:
        wallet_id = await _ensure_pay_wallet(user, pay_client, db)
        withdrawal = await pay_client.create_withdrawal(
            wallet_id=wallet_id,
            to_address=request.to_address,
            amount=request.amount,
            chain=request.chain,
            token_symbol=request.token_symbol,
        )

        return WithdrawalResponse(
            id=withdrawal['id'],
            chain=withdrawal['chain'],
            to_address=withdrawal['to_address'],
            token_symbol=withdrawal['token_symbol'],
            amount=withdrawal['amount'],
            amount_formatted=withdrawal.get('amount_formatted', _format_amount(
                withdrawal['amount'], withdrawal['token_symbol']
            )),
            status=withdrawal['status'],
            tx_hash=withdrawal.get('tx_hash'),
            created_at=withdrawal['created_at'],
        )
    except PayClientError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get('/withdrawals', response_model=WithdrawalsListResponse)
async def get_withdrawals(
    user_id: int = Query(...),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get withdrawal history for the user."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    if not user.pay_wallet_id:
        return WithdrawalsListResponse(withdrawals=[])

    pay_client = get_pay_client()

    try:
        withdrawals_data = await pay_client.get_withdrawals(
            user.pay_wallet_id, limit, offset
        )

        withdrawals = []
        for w in withdrawals_data:
            withdrawals.append(WithdrawalResponse(
                id=w['id'],
                chain=w['chain'],
                to_address=w['to_address'],
                token_symbol=w['token_symbol'],
                amount=w['amount'],
                amount_formatted=w.get('amount_formatted', _format_amount(
                    w['amount'], w['token_symbol']
                )),
                status=w['status'],
                tx_hash=w.get('tx_hash'),
                created_at=w['created_at'],
            ))

        return WithdrawalsListResponse(withdrawals=withdrawals)
    except PayClientError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
