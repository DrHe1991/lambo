from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.user import User, Follow
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserBrief

router = APIRouter()


@router.get('', response_model=list[UserBrief])
async def list_users(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List all users (for dev user selection)."""
    result = await db.execute(select(User).limit(limit))
    return result.scalars().all()


@router.post('', response_model=UserBrief, status_code=status.HTTP_201_CREATED)
async def create_user(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create a new user (no password needed)."""
    # Check if handle already exists
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
