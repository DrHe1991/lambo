from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, desc, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.user import User
from app.models.chat import ChatSession, ChatMember, Message
from app.schemas.chat import ChatSessionCreate, ChatSessionResponse, MessageCreate, MessageResponse
from app.schemas.user import UserBrief

router = APIRouter()


@router.post('/sessions', response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    session_data: ChatSessionCreate,
    creator_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a new chat session."""
    # Include creator in members
    all_member_ids = set(session_data.member_ids)
    all_member_ids.add(creator_id)

    # Verify all members exist
    for member_id in all_member_ids:
        user = await db.get(User, member_id)
        if not user:
            raise HTTPException(status_code=404, detail=f'User {member_id} not found')

    # Create new session (skip duplicate check for simplicity in Phase 1)
    session = ChatSession(
        name=session_data.name,
        is_group=session_data.is_group or len(all_member_ids) > 2,
    )
    db.add(session)
    await db.flush()

    # Add members
    for member_id in all_member_ids:
        member = ChatMember(session_id=session.id, user_id=member_id)
        db.add(member)

    await db.flush()
    return await get_session(session.id, creator_id, db)


@router.get('/sessions', response_model=list[ChatSessionResponse])
async def get_sessions(
    user_id: int = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get all chat sessions for a user."""
    # Get session IDs where user is a member
    result = await db.execute(
        select(ChatSession)
        .join(ChatMember)
        .where(ChatMember.user_id == user_id)
        .order_by(desc(ChatSession.updated_at))
        .limit(limit)
        .offset(offset)
    )
    sessions = result.scalars().all()

    responses = []
    for session in sessions:
        responses.append(await get_session(session.id, user_id, db))

    return responses


@router.get('/sessions/{session_id}', response_model=ChatSessionResponse)
async def get_session(
    session_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get a single chat session."""
    # Verify user is member
    membership = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.user_id == user_id)
        )
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail='Not a member of this chat')

    # Get session with members
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.members))
        .where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail='Session not found')

    # Get member users
    member_ids = [m.user_id for m in session.members]
    members_result = await db.execute(select(User).where(User.id.in_(member_ids)))
    members = members_result.scalars().all()

    # Get last message
    last_msg_result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(desc(Message.created_at))
        .limit(1)
    )
    last_msg = last_msg_result.scalar_one_or_none()

    # Get unread count
    user_membership = next((m for m in session.members if m.user_id == user_id), None)
    unread_count = 0
    if user_membership and user_membership.last_read_message_id:
        unread_result = await db.scalar(
            select(func.count()).where(
                and_(
                    Message.session_id == session_id,
                    Message.id > user_membership.last_read_message_id,
                )
            )
        )
        unread_count = unread_result or 0
    elif last_msg:
        # Never read = count all messages
        unread_result = await db.scalar(
            select(func.count()).where(Message.session_id == session_id)
        )
        unread_count = unread_result or 0

    return ChatSessionResponse(
        id=session.id,
        name=session.name,
        is_group=session.is_group,
        members=[
            UserBrief(
                id=m.id,
                name=m.name,
                handle=m.handle,
                avatar=m.avatar,
                trust_score=m.trust_score,
            )
            for m in members
        ],
        last_message=last_msg.content if last_msg else None,
        last_message_at=last_msg.created_at if last_msg else None,
        unread_count=unread_count,
        created_at=session.created_at,
    )


@router.post('/sessions/{session_id}/messages', response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    session_id: int,
    message_data: MessageCreate,
    sender_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Send a message to a chat session."""
    # Verify sender is member
    membership = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.user_id == sender_id)
        )
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail='Not a member of this chat')

    sender = await db.get(User, sender_id)
    if not sender:
        raise HTTPException(status_code=404, detail='Sender not found')

    # Create message
    message = Message(
        session_id=session_id,
        sender_id=sender_id,
        content=message_data.content,
    )
    db.add(message)

    # Update session timestamp
    session = await db.get(ChatSession, session_id)
    if session:
        from datetime import datetime
        session.updated_at = datetime.utcnow()

    await db.flush()
    await db.refresh(message)

    return MessageResponse(
        id=message.id,
        session_id=message.session_id,
        sender_id=message.sender_id,
        sender=UserBrief(
            id=sender.id,
            name=sender.name,
            handle=sender.handle,
            avatar=sender.avatar,
            trust_score=sender.trust_score,
        ),
        content=message.content,
        created_at=message.created_at,
    )


@router.get('/sessions/{session_id}/messages', response_model=list[MessageResponse])
async def get_messages(
    session_id: int,
    user_id: int = Query(...),
    limit: int = Query(50, ge=1, le=100),
    before_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get messages from a chat session."""
    # Verify user is member
    membership_result = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.user_id == user_id)
        )
    )
    membership = membership_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this chat')

    # Build query
    query = select(Message).where(Message.session_id == session_id)
    if before_id:
        query = query.where(Message.id < before_id)
    query = query.order_by(desc(Message.id)).limit(limit)

    result = await db.execute(query)
    messages = result.scalars().all()

    # Get senders
    sender_ids = list(set(m.sender_id for m in messages))
    senders_result = await db.execute(select(User).where(User.id.in_(sender_ids)))
    senders = {u.id: u for u in senders_result.scalars().all()}

    # Mark as read (update last_read_message_id)
    if messages:
        latest_id = max(m.id for m in messages)
        if not membership.last_read_message_id or latest_id > membership.last_read_message_id:
            membership.last_read_message_id = latest_id

    # Reverse to chronological order
    messages = list(reversed(messages))

    return [
        MessageResponse(
            id=m.id,
            session_id=m.session_id,
            sender_id=m.sender_id,
            sender=UserBrief(
                id=senders[m.sender_id].id,
                name=senders[m.sender_id].name,
                handle=senders[m.sender_id].handle,
                avatar=senders[m.sender_id].avatar,
                trust_score=senders[m.sender_id].trust_score,
            ),
            content=m.content,
            created_at=m.created_at,
        )
        for m in messages
        if m.sender_id in senders
    ]
