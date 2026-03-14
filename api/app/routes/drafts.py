from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.draft import Draft
from app.models.user import User
from app.schemas.draft import DraftCreate, DraftUpdate, DraftResponse

router = APIRouter()

MAX_DRAFTS_PER_USER = 10


@router.get('', response_model=list[DraftResponse])
async def list_drafts(
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get all drafts for a user, ordered by updated_at desc."""
    result = await db.execute(
        select(Draft)
        .where(Draft.user_id == user_id)
        .order_by(Draft.updated_at.desc())
    )
    return result.scalars().all()


@router.post('', response_model=DraftResponse, status_code=status.HTTP_201_CREATED)
async def create_draft(
    draft_data: DraftCreate,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a new draft. If user has >= 10 drafts, delete the oldest."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    
    count_result = await db.execute(
        select(Draft.id)
        .where(Draft.user_id == user_id)
        .order_by(Draft.updated_at.desc())
    )
    existing_drafts = count_result.scalars().all()
    
    if len(existing_drafts) >= MAX_DRAFTS_PER_USER:
        oldest_ids = existing_drafts[MAX_DRAFTS_PER_USER - 1:]
        await db.execute(
            delete(Draft).where(Draft.id.in_(oldest_ids))
        )
    
    draft = Draft(
        user_id=user_id,
        post_type=draft_data.post_type,
        title=draft_data.title,
        content=draft_data.content,
        bounty=draft_data.bounty,
        has_title=draft_data.has_title,
    )
    db.add(draft)
    await db.flush()
    await db.refresh(draft)
    return draft


@router.put('/{draft_id}', response_model=DraftResponse)
async def update_draft(
    draft_id: int,
    draft_data: DraftUpdate,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing draft."""
    draft = await db.get(Draft, draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail='Draft not found')
    if draft.user_id != user_id:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    if draft_data.post_type is not None:
        draft.post_type = draft_data.post_type
    if draft_data.title is not None:
        draft.title = draft_data.title
    if draft_data.content is not None:
        draft.content = draft_data.content
    if draft_data.bounty is not None:
        draft.bounty = draft_data.bounty
    if draft_data.has_title is not None:
        draft.has_title = draft_data.has_title
    
    draft.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(draft)
    return draft


@router.delete('/{draft_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_draft(
    draft_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Delete a draft."""
    draft = await db.get(Draft, draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail='Draft not found')
    if draft.user_id != user_id:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    await db.delete(draft)
    await db.flush()
