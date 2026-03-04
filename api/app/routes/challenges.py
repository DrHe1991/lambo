"""
Challenge/Report API Routes

Multi-layer arbitration system for content moderation.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.challenge_service import ChallengeService
from app.models.challenge import ViolationType, LAYER_FEES

router = APIRouter()


class CreateChallengeRequest(BaseModel):
    """Request to create a new challenge."""
    challenger_id: int
    content_type: str  # 'post' or 'comment'
    content_id: int
    reason: str
    violation_type: str = ViolationType.LOW_QUALITY.value
    layer: int = 1


class JuryVoteRequest(BaseModel):
    """Request to cast a jury vote."""
    juror_id: int
    vote_guilty: bool
    reasoning: str | None = None


@router.get('/fees')
async def get_challenge_fees():
    """Get challenge fee structure."""
    return {
        'layers': LAYER_FEES,
        'violation_types': {
            'low_quality': {'multiplier': 0.5, 'description': 'Low quality content'},
            'spam': {'multiplier': 1.0, 'description': 'Spam or unwanted ads'},
            'plagiarism': {'multiplier': 1.5, 'description': 'Copied or AI-generated without disclosure'},
            'scam': {'multiplier': 2.0, 'description': 'Scam, fraud, or phishing'},
        },
        'distribution': {
            'reporter': '35%',
            'jury': '25%',
            'platform': '40%',
        },
    }


@router.post('')
async def create_challenge(
    req: CreateChallengeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new challenge (report) for content.
    
    L1 (100 sat): AI auto-judgment
    L2 (500 sat): Community jury voting
    L3 (1500 sat): Committee review
    """
    service = ChallengeService(db)
    result = await service.create_challenge(
        challenger_id=req.challenger_id,
        content_type=req.content_type,
        content_id=req.content_id,
        reason=req.reason,
        violation_type=req.violation_type,
        layer=req.layer,
    )
    await db.commit()

    if 'error' in result:
        raise HTTPException(status_code=400, detail=result['error'])

    return result


@router.get('/{challenge_id}')
async def get_challenge(
    challenge_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get challenge details."""
    service = ChallengeService(db)
    result = await service.get_challenge(challenge_id)

    if not result:
        raise HTTPException(status_code=404, detail='Challenge not found')

    return result


@router.post('/{challenge_id}/vote')
async def cast_jury_vote(
    challenge_id: int,
    req: JuryVoteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Cast a jury vote on a L2/L3 challenge.
    
    Only users with trust >= 400 can vote.
    """
    service = ChallengeService(db)
    result = await service.cast_jury_vote(
        challenge_id=challenge_id,
        juror_id=req.juror_id,
        vote_guilty=req.vote_guilty,
        reasoning=req.reasoning,
    )
    await db.commit()

    if 'error' in result:
        raise HTTPException(status_code=400, detail=result['error'])

    return result


@router.get('/jury/{user_id}/pending')
async def get_pending_jury_challenges(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get challenges available for a juror to vote on."""
    service = ChallengeService(db)
    return await service.get_pending_jury_challenges(user_id)
