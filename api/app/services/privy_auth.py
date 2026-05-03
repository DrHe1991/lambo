"""Privy JWT verification.

Privy issues short-lived JWTs (ES256, signed by Privy's JWKS) that we verify
on every authenticated request. The JWT contains:
    sub  — Privy user ID (e.g., did:privy:abc123)
    iss  — privy.io
    aud  — our Privy app ID
    sid  — session ID
    exp  — expiry

We map sub -> our internal users.id via users.privy_user_id (set on /wallet/link).
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx
from jose import jwt, JWTError

from app.config import settings

logger = logging.getLogger(__name__)

# Cache JWKS for 1 hour
_JWKS_CACHE: dict[str, tuple[float, dict]] = {}
_JWKS_TTL = 3600


@dataclass(slots=True)
class PrivyClaims:
    privy_user_id: str   # `sub` claim, e.g. "did:privy:cl..."
    session_id: str | None
    app_id: str
    issued_at: int
    expires_at: int


class PrivyAuthError(Exception):
    """Raised when Privy JWT verification fails."""


async def _fetch_jwks() -> dict:
    """Fetch (and cache) the JWKS for our Privy app."""
    if not settings.privy_app_id:
        raise PrivyAuthError('PRIVY_APP_ID not configured')

    cached = _JWKS_CACHE.get(settings.privy_app_id)
    now = time.time()
    if cached and (now - cached[0]) < _JWKS_TTL:
        return cached[1]

    url = settings.privy_jwks_url.format(app_id=settings.privy_app_id)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        jwks = resp.json()
    _JWKS_CACHE[settings.privy_app_id] = (now, jwks)
    return jwks


async def verify_privy_token(token: str) -> PrivyClaims:
    """Decode and verify a Privy access token.

    Raises PrivyAuthError on any failure (signature, expiry, audience).
    """
    if not token:
        raise PrivyAuthError('Empty token')

    try:
        jwks = await _fetch_jwks()
    except Exception as e:
        logger.exception('Failed to fetch Privy JWKS')
        raise PrivyAuthError(f'JWKS fetch failed: {e}')

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise PrivyAuthError(f'Invalid token header: {e}')

    kid = unverified_header.get('kid')
    key = next((k for k in jwks.get('keys', []) if k.get('kid') == kid), None)
    if key is None and jwks.get('keys'):
        # Privy historically rotates infrequently; if kid missing, fall back to first key
        key = jwks['keys'][0]
    if key is None:
        raise PrivyAuthError('No matching JWKS key')

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[unverified_header.get('alg', 'ES256')],
            audience=settings.privy_app_id,
            issuer='privy.io',
        )
    except JWTError as e:
        raise PrivyAuthError(f'Token verification failed: {e}')

    sub = claims.get('sub')
    if not sub:
        raise PrivyAuthError('Token missing sub claim')

    return PrivyClaims(
        privy_user_id=sub,
        session_id=claims.get('sid'),
        app_id=settings.privy_app_id,
        issued_at=int(claims.get('iat', 0)),
        expires_at=int(claims.get('exp', 0)),
    )
