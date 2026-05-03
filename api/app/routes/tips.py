"""Tip endpoints — non-custodial.

Flow:
  1. Frontend computes tip amount (default $0.10 USDC = 100_000 micro).
  2. Frontend calls POST /tip/quote to validate the post + creator wallet exists
     and to get back the canonical recipient address (so the client can sign
     against an authoritative target).
  3. Frontend uses Privy delegated actions to broadcast a USDC transfer on Base
     directly from the user's embedded wallet to the creator's address.
  4. Frontend POSTs /tip/confirm with the resulting tx_hash.
  5. Backend verifies the tx on-chain (chain_verifier.verify_usdc_tip),
     creates the PostLike row + Ledger entries, and bumps post counters.
  6. GET /tip/history paginates the user's TIP_SENT/TIP_RECEIVED ledger rows.

The backend NEVER moves money. It only records what already happened on-chain.
"""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.config import settings
from app.db.database import get_db
from app.models.ledger import ActionType, RefType
from app.models.post import Post, PostLike, PostStatus
from app.models.user import User
from app.services.chain_verifier import ChainVerifyError, verify_usdc_tip
from app.services.ledger_service import LedgerService

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Schemas ----------------------------------------------------------------

class TipQuoteRequest(BaseModel):
    post_id: int
    amount_usdc_micro: int = Field(..., ge=1)


class TipQuoteResponse(BaseModel):
    post_id: int
    creator_user_id: int
    creator_handle: str
    creator_wallet: str
    amount_usdc_micro: int
    usdc_token_address: str
    chain_id: int
    min_tip_micro: int
    max_tip_micro: int
    already_tipped: bool


class TipConfirmRequest(BaseModel):
    post_id: int
    tx_hash: str = Field(..., min_length=66, max_length=66)


class TipConfirmResponse(BaseModel):
    tip_id: int
    post_id: int
    creator_user_id: int
    amount_usdc_micro: int
    tx_hash: str
    confirmed_at: datetime
    post_likes_count: int
    post_tip_total_usdc_micro: int


class TipHistoryItem(BaseModel):
    id: int
    direction: str  # 'sent' or 'received'
    amount_usdc_micro: int
    counterparty_handle: str | None
    post_id: int | None
    tx_hash: str | None
    created_at: datetime


# --- Helpers ----------------------------------------------------------------

def _validate_amount(amount: int) -> None:
    if amount < settings.min_tip_micro:
        raise HTTPException(
            status_code=400,
            detail=f'Tip must be at least {settings.min_tip_micro} micro-USDC',
        )
    if amount > settings.max_tip_micro:
        raise HTTPException(
            status_code=400,
            detail=f'Tip cannot exceed {settings.max_tip_micro} micro-USDC',
        )


# --- Routes -----------------------------------------------------------------

@router.post('/quote', response_model=TipQuoteResponse)
async def tip_quote(
    payload: TipQuoteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate a tip and return the canonical creator address + chain params."""
    _validate_amount(payload.amount_usdc_micro)

    post = await db.get(Post, payload.post_id)
    if not post or post.status != PostStatus.ACTIVE.value:
        raise HTTPException(status_code=404, detail='Post not found')

    creator = await db.get(User, post.author_id)
    if not creator:
        raise HTTPException(status_code=404, detail='Creator not found')
    if not creator.embedded_wallet_address:
        raise HTTPException(
            status_code=409,
            detail='Creator has not linked a wallet yet — cannot receive tips',
        )
    if creator.id == current_user.id:
        raise HTTPException(status_code=400, detail='Cannot tip your own post')

    already = await db.execute(
        select(PostLike).where(
            PostLike.post_id == post.id,
            PostLike.user_id == current_user.id,
        )
    )

    return TipQuoteResponse(
        post_id=post.id,
        creator_user_id=creator.id,
        creator_handle=creator.handle,
        creator_wallet=creator.embedded_wallet_address,
        amount_usdc_micro=payload.amount_usdc_micro,
        usdc_token_address=settings.usdc_address,
        chain_id=settings.base_chain_id,
        min_tip_micro=settings.min_tip_micro,
        max_tip_micro=settings.max_tip_micro,
        already_tipped=already.scalar_one_or_none() is not None,
    )


@router.post('/confirm', response_model=TipConfirmResponse)
async def tip_confirm(
    payload: TipConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify an on-chain USDC transfer and record the tip."""
    if not current_user.embedded_wallet_address:
        raise HTTPException(status_code=409, detail='Sender wallet not linked')

    post = await db.get(Post, payload.post_id)
    if not post or post.status != PostStatus.ACTIVE.value:
        raise HTTPException(status_code=404, detail='Post not found')

    creator = await db.get(User, post.author_id)
    if not creator or not creator.embedded_wallet_address:
        raise HTTPException(status_code=409, detail='Creator wallet not linked')

    # Reject duplicate tx_hash
    dup = await db.execute(select(PostLike).where(PostLike.tx_hash == payload.tx_hash))
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail='Transaction already recorded')

    try:
        verified = await verify_usdc_tip(
            tx_hash=payload.tx_hash,
            expected_sender=current_user.embedded_wallet_address,
            expected_recipient=creator.embedded_wallet_address,
            min_amount_micro=settings.min_tip_micro,
        )
    except ChainVerifyError as e:
        raise HTTPException(status_code=400, detail=f'On-chain verification failed: {e}')

    # Upsert the PostLike row. If user previously had a like-without-tx (shouldn't
    # happen in pure flow but be defensive), update it; else insert.
    existing = await db.execute(
        select(PostLike).where(
            PostLike.post_id == post.id,
            PostLike.user_id == current_user.id,
        )
    )
    like = existing.scalar_one_or_none()
    is_new_like = like is None
    confirmed_at = datetime.utcnow()
    if like is None:
        like = PostLike(
            post_id=post.id,
            user_id=current_user.id,
            tx_hash=verified.tx_hash,
            amount_usdc_micro=verified.amount_micro,
            confirmed_at=confirmed_at,
        )
        db.add(like)
    else:
        like.tx_hash = verified.tx_hash
        like.amount_usdc_micro = verified.amount_micro
        like.confirmed_at = confirmed_at

    if is_new_like:
        post.likes_count += 1
    post.tip_count += 1
    post.tip_total_usdc_micro += verified.amount_micro

    ledger = LedgerService(db)
    await ledger.record(
        user_id=current_user.id,
        amount_usdc_micro=-verified.amount_micro,
        action_type=ActionType.TIP_SENT,
        ref_type=RefType.POST,
        ref_id=post.id,
        tx_hash=verified.tx_hash,
        note=f'tip to @{creator.handle}',
    )
    await ledger.record(
        user_id=creator.id,
        amount_usdc_micro=verified.amount_micro,
        action_type=ActionType.TIP_RECEIVED,
        ref_type=RefType.POST,
        ref_id=post.id,
        tx_hash=verified.tx_hash,
        note=f'tip from @{current_user.handle}',
    )

    await db.commit()
    await db.refresh(like)

    return TipConfirmResponse(
        tip_id=like.id,
        post_id=post.id,
        creator_user_id=creator.id,
        amount_usdc_micro=verified.amount_micro,
        tx_hash=verified.tx_hash,
        confirmed_at=confirmed_at,
        post_likes_count=post.likes_count,
        post_tip_total_usdc_micro=post.tip_total_usdc_micro,
    )


@router.get('/history', response_model=list[TipHistoryItem])
async def tip_history(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated list of the current user's tip activity (sent + received)."""
    from app.models.ledger import Ledger
    from sqlalchemy import desc, or_

    rows = await db.execute(
        select(Ledger)
        .where(
            Ledger.user_id == current_user.id,
            or_(
                Ledger.action_type == ActionType.TIP_SENT.value,
                Ledger.action_type == ActionType.TIP_RECEIVED.value,
            ),
        )
        .order_by(desc(Ledger.created_at))
        .limit(limit)
        .offset(offset)
    )
    entries = list(rows.scalars().all())

    # Resolve counterparty handles via the post's author / liker lookup
    items: list[TipHistoryItem] = []
    for e in entries:
        counterparty = None
        post_id = e.ref_id if e.ref_type == RefType.POST.value else None
        if post_id is not None and e.tx_hash:
            tip_q = await db.execute(
                select(PostLike).where(PostLike.tx_hash == e.tx_hash)
            )
            tip = tip_q.scalar_one_or_none()
            if tip is not None:
                if e.action_type == ActionType.TIP_SENT.value:
                    post = await db.get(Post, tip.post_id)
                    if post:
                        author = await db.get(User, post.author_id)
                        counterparty = author.handle if author else None
                else:
                    sender = await db.get(User, tip.user_id)
                    counterparty = sender.handle if sender else None

        items.append(
            TipHistoryItem(
                id=e.id,
                direction='sent' if e.action_type == ActionType.TIP_SENT.value else 'received',
                amount_usdc_micro=abs(e.amount_usdc_micro),
                counterparty_handle=counterparty,
                post_id=post_id,
                tx_hash=e.tx_hash,
                created_at=e.created_at,
            )
        )
    return items
