"""Wallet linking — binds a Privy embedded wallet to an internal User row.

Called by the frontend right after Privy login completes for the first time
(or after the user creates an embedded wallet in a session that didn't have
one). Idempotent.
"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_privy_claims_for_link
from app.db.database import get_db
from app.models.user import User
from app.services.privy_auth import PrivyClaims

logger = logging.getLogger(__name__)
router = APIRouter()

ETH_ADDRESS_RE = re.compile(r'^0x[a-fA-F0-9]{40}$')


class LinkWalletRequest(BaseModel):
    embedded_wallet_address: str = Field(..., description='0x-prefixed Base address from Privy')
    delegated_actions_enabled: bool = False
    name: str | None = None
    handle: str | None = None
    avatar: str | None = None
    email: str | None = None


class LinkWalletResponse(BaseModel):
    user_id: int
    handle: str
    embedded_wallet_address: str
    delegated_actions_enabled: bool
    is_new: bool


def _make_handle(seed: str) -> str:
    """Generate a unique-ish handle from the privy id or email."""
    base = re.sub(r'[^a-z0-9]', '', seed.lower())[:18] or 'user'
    return f'{base}{abs(hash(seed)) % 10000:04d}'


@router.post('/link', response_model=LinkWalletResponse)
async def link_wallet(
    payload: LinkWalletRequest,
    claims: PrivyClaims = Depends(get_privy_claims_for_link),
    db: AsyncSession = Depends(get_db),
):
    """Bind a Privy wallet to a User row. Creates the User on first call."""
    if not ETH_ADDRESS_RE.match(payload.embedded_wallet_address):
        raise HTTPException(status_code=400, detail='Invalid wallet address')

    addr = payload.embedded_wallet_address.lower()

    result = await db.execute(
        select(User).where(User.privy_user_id == claims.privy_user_id)
    )
    user = result.scalar_one_or_none()
    is_new = user is None

    if user is None:
        # Check email collision
        if payload.email:
            existing_email = await db.execute(
                select(User).where(User.email == payload.email)
            )
            user = existing_email.scalar_one_or_none()

        if user is None:
            handle = payload.handle or _make_handle(payload.email or claims.privy_user_id)
            # Uniqueness: bump suffix if collision
            for attempt in range(5):
                exists = await db.execute(select(User).where(User.handle == handle))
                if exists.scalar_one_or_none() is None:
                    break
                handle = f'{handle[:14]}{abs(hash(handle + str(attempt))) % 10000:04d}'

            user = User(
                name=payload.name or handle,
                handle=handle,
                avatar=payload.avatar,
                email=payload.email,
                email_verified=bool(payload.email),
            )
            db.add(user)
            await db.flush()

    user.privy_user_id = claims.privy_user_id
    user.embedded_wallet_address = addr
    # Backfill profile fields that may have been missing on first link.
    if payload.email and not user.email:
        user.email = payload.email
        user.email_verified = True
    if payload.name and not user.name:
        user.name = payload.name
    if payload.avatar and not user.avatar:
        user.avatar = payload.avatar
    if payload.delegated_actions_enabled and user.delegated_actions_enabled_at is None:
        from datetime import datetime
        user.delegated_actions_enabled_at = datetime.utcnow()

    await db.commit()
    await db.refresh(user)

    return LinkWalletResponse(
        user_id=user.id,
        handle=user.handle,
        embedded_wallet_address=addr,
        delegated_actions_enabled=user.delegated_actions_enabled_at is not None,
        is_new=is_new,
    )
