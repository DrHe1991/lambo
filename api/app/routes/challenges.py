"""Challenge Layer 1 endpoints — AI content moderation."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.challenge import ChallengeCreate, ChallengeResponse
from app.services.challenge_service import ChallengeService, ChallengeError

router = APIRouter()


@router.post('', response_model=ChallengeResponse, status_code=status.HTTP_201_CREATED)
async def create_challenge(
    data: ChallengeCreate,
    challenger_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Report content for AI review. Costs 100 × K(trust) sat."""
    svc = ChallengeService(db)
    try:
        challenge = await svc.create_challenge(
            challenger_id=challenger_id,
            content_type=data.content_type,
            content_id=data.content_id,
            reason=data.reason,
        )
    except ChallengeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return challenge


@router.get('/{challenge_id}', response_model=ChallengeResponse)
async def get_challenge(
    challenge_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get a single challenge by ID."""
    svc = ChallengeService(db)
    challenge = await svc.get_challenge(challenge_id)
    if not challenge:
        raise HTTPException(status_code=404, detail='Challenge not found')
    return challenge


@router.get('', response_model=list[ChallengeResponse])
async def list_challenges(
    content_type: str | None = Query(None, pattern=r'^(post|comment)$'),
    content_id: int | None = Query(None),
    user_id: int | None = Query(None, description='Filter by challenger'),
    author_id: int | None = Query(None, description='Filter by content author'),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List challenges with optional filters."""
    svc = ChallengeService(db)

    if content_type and content_id:
        return await svc.get_challenges_for_content(content_type, content_id)

    if user_id:
        return await svc.get_user_challenges(user_id, 'challenger', limit, offset)

    if author_id:
        return await svc.get_user_challenges(author_id, 'author', limit, offset)

    # Default: all challenges (most recent)
    from sqlalchemy import select, desc
    from app.models.challenge import Challenge

    result = await db.execute(
        select(Challenge)
        .order_by(desc(Challenge.created_at))
        .limit(limit).offset(offset)
    )
    return list(result.scalars().all())
