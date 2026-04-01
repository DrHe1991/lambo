import hashlib
import secrets
from datetime import datetime, timedelta

from jose import jwt, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.auth import RefreshToken


def create_access_token(user_id: int) -> str:
    expires = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        'sub': str(user_id),
        'type': 'access',
        'exp': expires,
        'iat': datetime.utcnow(),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Decode and validate an access token. Raises JWTError on failure."""
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    if payload.get('type') != 'access':
        raise JWTError('Invalid token type')
    return payload


def create_refresh_token() -> str:
    """Generate a random refresh token (raw value — hash before storing)."""
    return secrets.token_hex(32)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


async def store_refresh_token(
    user_id: int, raw_token: str, db: AsyncSession, device_hint: str | None = None
) -> None:
    token = RefreshToken(
        user_id=user_id,
        token_hash=hash_token(raw_token),
        device_hint=device_hint,
        expires_at=datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(token)
    await db.flush()


async def rotate_refresh_token(
    raw_token: str, db: AsyncSession, device_hint: str | None = None
) -> tuple[int, str, str]:
    """Validate and rotate a refresh token. Returns (user_id, new_access, new_refresh)."""
    token_hash = hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.utcnow(),
        )
    )
    existing = result.scalar_one_or_none()
    if not existing:
        raise ValueError('Invalid or expired refresh token')

    # Revoke old token
    existing.revoked_at = datetime.utcnow()

    # Issue new pair
    new_access = create_access_token(existing.user_id)
    new_refresh = create_refresh_token()
    await store_refresh_token(existing.user_id, new_refresh, db, device_hint)

    return existing.user_id, new_access, new_refresh


async def revoke_refresh_token(raw_token: str, db: AsyncSession) -> None:
    token_hash = hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.revoked_at = datetime.utcnow()
