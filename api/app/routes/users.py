from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.user import User, Follow
from app.models.ledger import Ledger
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserBrief
from app.schemas.ledger import LedgerEntry, BalanceResponse
from app.services.ledger_service import LedgerService
from app.services.trust_service import TrustScoreService, dynamic_fee_multiplier, trust_tier

router = APIRouter()


@router.get('', response_model=list[UserBrief])
async def list_users(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List all users (for dev user selection)."""
    result = await db.execute(select(User).limit(limit))
    return result.scalars().all()


@router.get('/search', response_model=list[UserBrief])
async def search_users(
    q: str = Query(..., min_length=1, max_length=50),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Search users by handle (exact or prefix match)."""
    # Strip @ if provided
    query = q.lstrip('@').lower()
    
    # Search by handle prefix (case-insensitive)
    result = await db.execute(
        select(User)
        .where(func.lower(User.handle).like(f'{query}%'))
        .order_by(User.handle)
        .limit(limit)
    )
    return result.scalars().all()


@router.post('', response_model=UserBrief, status_code=status.HTTP_201_CREATED)
async def create_user(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create a new user (0 sat, 1 free post)."""
    existing = await db.execute(select(User).where(User.handle == user_data.handle))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail='Handle already taken')

    user = User(
        name=user_data.name,
        handle=user_data.handle,
        avatar=user_data.avatar,
        bio=user_data.bio if hasattr(user_data, 'bio') else None,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.get('/{user_id}', response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get user by ID."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    # Count followers and following
    followers_count = await db.scalar(
        select(func.count()).where(Follow.following_id == user_id)
    )
    following_count = await db.scalar(
        select(func.count()).where(Follow.follower_id == user_id)
    )

    # Check if current user is following
    is_following = False
    if current_user_id:
        follow = await db.execute(
            select(Follow).where(
                and_(Follow.follower_id == current_user_id, Follow.following_id == user_id)
            )
        )
        is_following = follow.scalar_one_or_none() is not None

    return UserResponse(
        id=user.id,
        name=user.name,
        handle=user.handle,
        avatar=user.avatar,
        bio=user.bio,
        trust_score=user.trust_score,
        created_at=user.created_at,
        available_balance=user.available_balance,
        free_posts_remaining=user.free_posts_remaining,
        followers_count=followers_count or 0,
        following_count=following_count or 0,
        is_following=is_following,
    )


@router.get('/handle/{handle}', response_model=UserResponse)
async def get_user_by_handle(
    handle: str,
    current_user_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get user by handle."""
    result = await db.execute(select(User).where(User.handle == handle))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    return await get_user(user.id, current_user_id, db)


@router.patch('/{user_id}', response_model=UserBrief)
async def update_user(
    user_id: int, user_data: UserUpdate, db: AsyncSession = Depends(get_db)
):
    """Update user profile."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()
    await db.refresh(user)
    return user


@router.post('/{user_id}/follow', status_code=status.HTTP_201_CREATED)
async def follow_user(
    user_id: int,
    follower_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Follow a user."""
    if user_id == follower_id:
        raise HTTPException(status_code=400, detail='Cannot follow yourself')

    # Check both users exist
    user = await db.get(User, user_id)
    follower = await db.get(User, follower_id)
    if not user or not follower:
        raise HTTPException(status_code=404, detail='User not found')

    # Check if already following
    existing = await db.execute(
        select(Follow).where(
            and_(Follow.follower_id == follower_id, Follow.following_id == user_id)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail='Already following')

    follow = Follow(follower_id=follower_id, following_id=user_id)
    db.add(follow)
    return {'status': 'followed'}


@router.delete('/{user_id}/follow', status_code=status.HTTP_200_OK)
async def unfollow_user(
    user_id: int,
    follower_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Unfollow a user."""
    result = await db.execute(
        select(Follow).where(
            and_(Follow.follower_id == follower_id, Follow.following_id == user_id)
        )
    )
    follow = result.scalar_one_or_none()
    if not follow:
        raise HTTPException(status_code=404, detail='Not following this user')

    await db.delete(follow)
    return {'status': 'unfollowed'}


@router.get('/{user_id}/followers', response_model=list[UserBrief])
async def get_followers(
    user_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get user's followers."""
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
    """Get users that this user follows."""
    result = await db.execute(
        select(User)
        .join(Follow, Follow.following_id == User.id)
        .where(Follow.follower_id == user_id)
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


# --- Balance & Ledger ---

@router.get('/{user_id}/balance', response_model=BalanceResponse)
async def get_balance(user_id: int, db: AsyncSession = Depends(get_db)):
    """Get user's sat balance with 24h net change."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    # Sum all ledger amounts in last 24h
    cutoff = datetime.utcnow() - timedelta(hours=24)
    result = await db.execute(
        select(func.coalesce(func.sum(Ledger.amount), 0))
        .where(and_(Ledger.user_id == user_id, Ledger.created_at >= cutoff))
    )
    change_24h = result.scalar_one()

    return BalanceResponse(
        user_id=user.id,
        available_balance=user.available_balance,
        change_24h=change_24h,
    )


@router.get('/{user_id}/ledger', response_model=list[LedgerEntry])
async def get_ledger(
    user_id: int,
    action_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get user's transaction history."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    ledger = LedgerService(db)
    entries = await ledger.get_history(user_id, limit, offset, action_type)
    return entries


# --- Trust Score ---

@router.get('/{user_id}/trust')
async def get_trust_breakdown(user_id: int, db: AsyncSession = Depends(get_db)):
    """Get user's TrustScore breakdown (4 dimensions + composite)."""
    svc = TrustScoreService(db)
    try:
        return await svc.get_breakdown(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail='User not found')


@router.get('/{user_id}/costs')
async def get_user_costs(user_id: int, db: AsyncSession = Depends(get_db)):
    """Get dynamic action costs for this user (adjusted by K(trust))."""
    from app.services.trust_service import compute_trust_score
    
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    # Compute fresh trust score from sub-dimensions (S8)
    fresh_trust = compute_trust_score(
        user.creator_score, user.curator_score,
        user.juror_score, user.risk_score,
    )
    k = dynamic_fee_multiplier(fresh_trust)

    def apply(base: int) -> int:
        return max(1, int(round(base * k)))

    # Base costs aligned with simulator (S6)
    return {
        'user_id': user.id,
        'trust_score': fresh_trust,
        'tier': trust_tier(fresh_trust),
        'fee_multiplier': k,
        'costs': {
            'post': apply(50),
            'question': apply(100),
            'answer': apply(50),
            'comment': apply(20),
            'reply': apply(10),
            'like_post': apply(20),
            'like_comment': apply(10),
        },
    }

