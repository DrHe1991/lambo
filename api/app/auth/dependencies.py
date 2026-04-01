from fastapi import Depends, Header, HTTPException, Query, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import decode_access_token
from app.db.database import get_db
from app.models.user import User


async def get_current_user(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Strict auth: requires a valid Bearer token. Raises 401 if missing/invalid."""
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing auth token')

    token = authorization.removeprefix('Bearer ')
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid or expired token')

    user_id = int(payload['sub'])
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='User not found')

    return user


async def get_optional_user(
    authorization: str | None = Header(None),
    user_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Lenient auth: accepts Bearer token OR ?user_id=N (legacy compat). Returns None if neither."""
    # Try Bearer token first
    if authorization and authorization.startswith('Bearer '):
        token = authorization.removeprefix('Bearer ')
        try:
            payload = decode_access_token(token)
            uid = int(payload['sub'])
            return await db.get(User, uid)
        except (JWTError, ValueError):
            pass

    # Fall back to query param (migration period)
    if user_id is not None:
        return await db.get(User, user_id)

    return None
