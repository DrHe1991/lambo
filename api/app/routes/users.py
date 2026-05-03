"""User CRUD, follows, ledger view.

Auth: write endpoints (PATCH, follow/unfollow) require Bearer token via
get_current_user. Read endpoints are public but personalize for the viewer
when get_optional_user resolves.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, get_optional_user
from app.config import settings
from app.db.database import get_db
from app.models.user import Follow, User
from app.schemas.ledger import LedgerEntry, WalletResponse
from app.schemas.user import UserBrief, UserResponse, UserUpdate
from app.services.ledger_service import LedgerService

router = APIRouter()


@router.get('', response_model=list[UserBrief])
async def list_users(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List all users (used for dev quick-login picker)."""
    result = await db.execute(select(User).limit(limit))
    return result.scalars().all()


@router.get('/me', response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Current user's profile (post-Privy-link)."""
    followers_count = await db.scalar(
        select(func.count()).where(Follow.following_id == current_user.id)
    ) or 0
    following_count = await db.scalar(
        select(func.count()).where(Follow.follower_id == current_user.id)
    ) or 0

    today = date.today()
    free_remaining = current_user.free_posts_remaining
    if current_user.free_posts_reset_date is None or current_user.free_posts_reset_date < today:
        free_remaining = settings.free_posts_per_day

    return UserResponse(
        id=current_user.id,
        name=current_user.name,
        handle=current_user.handle,
        avatar=current_user.avatar,
        embedded_wallet_address=current_user.embedded_wallet_address,
        trust_score=current_user.trust_score,
        bio=current_user.bio,
        created_at=current_user.created_at,
        followers_count=followers_count,
        following_count=following_count,
        is_following=False,
        free_posts_remaining=free_remaining,
    )


@router.get('/search', response_model=list[UserBrief])
async def search_users(
    q: str = Query(..., min_length=1, max_length=50),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Search users by handle (prefix match, case-insensitive)."""
    query = q.lstrip('@').lower()
    result = await db.execute(
        select(User)
        .where(func.lower(User.handle).like(f'{query}%'))
        .order_by(User.handle)
        .limit(limit)
    )
    return result.scalars().all()


@router.get('/{user_id}', response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user by ID (public)."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    followers_count = await db.scalar(
        select(func.count()).where(Follow.following_id == user_id)
    ) or 0
    following_count = await db.scalar(
        select(func.count()).where(Follow.follower_id == user_id)
    ) or 0

    is_following = False
    if current_user is not None and current_user.id != user.id:
        follow = await db.execute(
            select(Follow).where(
                and_(Follow.follower_id == current_user.id, Follow.following_id == user.id)
            )
        )
        is_following = follow.scalar_one_or_none() is not None

    return UserResponse(
        id=user.id,
        name=user.name,
        handle=user.handle,
        avatar=user.avatar,
        embedded_wallet_address=user.embedded_wallet_address,
        trust_score=user.trust_score,
        bio=user.bio,
        created_at=user.created_at,
        followers_count=followers_count,
        following_count=following_count,
        is_following=is_following,
        free_posts_remaining=user.free_posts_remaining,
    )


@router.get('/handle/{handle}', response_model=UserResponse)
async def get_user_by_handle(
    handle: str,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user by handle (public)."""
    result = await db.execute(select(User).where(User.handle == handle))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    return await get_user(user.id, current_user, db)


@router.patch('/me', response_model=UserBrief)
async def update_me(
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's profile."""
    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post('/{user_id}/follow', status_code=status.HTTP_201_CREATED)
async def follow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Follow another user."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail='Cannot follow yourself')

    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail='User not found')

    existing = await db.execute(
        select(Follow).where(
            and_(Follow.follower_id == current_user.id, Follow.following_id == user_id)
        )
    )
    if existing.scalar_one_or_none():
        return {'status': 'already_following'}

    db.add(Follow(follower_id=current_user.id, following_id=user_id))
    await db.commit()
    return {'status': 'followed'}


@router.delete('/{user_id}/follow', status_code=status.HTTP_200_OK)
async def unfollow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unfollow a user."""
    result = await db.execute(
        select(Follow).where(
            and_(Follow.follower_id == current_user.id, Follow.following_id == user_id)
        )
    )
    follow = result.scalar_one_or_none()
    if not follow:
        return {'status': 'not_following'}
    await db.delete(follow)
    await db.commit()
    return {'status': 'unfollowed'}


@router.get('/{user_id}/followers', response_model=list[UserBrief])
async def get_followers(
    user_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get user's followers (public)."""
    result = await db.execute(
        select(User)
        .join(Follow, Follow.follower_id == User.id)
        .where(Follow.following_id == user_id)
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.get('/{user_id}/following', response_model=list[UserBrief])
async def get_following(
    user_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get users that this user follows (public)."""
    result = await db.execute(
        select(User)
        .join(Follow, Follow.following_id == User.id)
        .where(Follow.follower_id == user_id)
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


# --- Wallet info & ledger view ---

@router.get('/me/wallet', response_model=WalletResponse)
async def get_my_wallet(
    current_user: User = Depends(get_current_user),
):
    """Return the current user's wallet address. Balance is read on-chain by the client."""
    return WalletResponse(
        user_id=current_user.id,
        embedded_wallet_address=current_user.embedded_wallet_address,
        delegated_actions_enabled=current_user.delegated_actions_enabled_at is not None,
    )


@router.get('/me/ledger', response_model=list[LedgerEntry])
async def get_my_ledger(
    action_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Current user's ledger (tip history + free post events)."""
    ledger = LedgerService(db)
    entries = await ledger.get_history(current_user.id, limit, offset, action_type)
    return entries
