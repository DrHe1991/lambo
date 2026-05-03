"""Auth dependencies.

Two paths supported during the Privy migration:

1. Privy JWT (preferred, post-pivot): `Authorization: Bearer <privy-token>`.
   Mapped to internal users.id via users.privy_user_id.

2. Legacy local JWT (Google OAuth + Web3 nonce, kept for dev): same header
   shape but signed by our own SECRET_KEY. Resolved via decode_access_token.

A request is authenticated if EITHER path resolves to a known user. We try
Privy first because it's the production path; local JWT is a fallback for
existing dev tokens and the dev quick-login.

The legacy `?user_id=N` query-param shortcut is GONE on monetary endpoints.
For read-only public endpoints that want optional viewer context, use
`get_optional_user`.
"""
from __future__ import annotations

import logging

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import decode_access_token
from app.db.database import get_db
from app.models.user import User
from app.services.privy_auth import PrivyAuthError, verify_privy_token

logger = logging.getLogger(__name__)


async def _resolve_user(token: str, db: AsyncSession) -> User | None:
    """Try Privy first, then legacy local JWT. Returns None if neither resolves."""
    # Privy
    try:
        claims = await verify_privy_token(token)
        result = await db.execute(
            select(User).where(User.privy_user_id == claims.privy_user_id)
        )
        user = result.scalar_one_or_none()
        if user is not None:
            return user
        # Privy-valid token but user not yet linked. Caller should call /wallet/link.
        # We return None here so the endpoint can decide whether to proxy a 409.
        return None
    except PrivyAuthError:
        pass
    except Exception as e:
        logger.warning('Privy verify error: %s', e)

    # Legacy local JWT
    try:
        payload = decode_access_token(token)
        uid = int(payload['sub'])
        return await db.get(User, uid)
    except (JWTError, ValueError, KeyError):
        return None


async def get_current_user(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Strict auth: requires a valid Bearer token (Privy or legacy). Raises 401."""
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Missing auth token',
        )
    token = authorization.removeprefix('Bearer ').strip()
    user = await _resolve_user(token, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid token or user not linked. Call /api/wallet/link first.',
        )
    return user


async def get_optional_user(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Lenient auth: returns the user if Bearer token is valid, else None.

    Used on read-only endpoints that personalize for logged-in viewers but
    also serve anonymous traffic.
    """
    if not authorization or not authorization.startswith('Bearer '):
        return None
    token = authorization.removeprefix('Bearer ').strip()
    return await _resolve_user(token, db)


async def get_privy_claims_for_link(
    authorization: str | None = Header(None),
):
    """Used only by /wallet/link — accepts a Privy token whose user isn't
    yet in our DB. Returns the verified claims so the route can create/link
    the user record."""
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Missing Privy token')
    token = authorization.removeprefix('Bearer ').strip()
    try:
        return await verify_privy_token(token)
    except PrivyAuthError as e:
        raise HTTPException(status_code=401, detail=f'Invalid Privy token: {e}')
