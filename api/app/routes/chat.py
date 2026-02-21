from fastapi import APIRouter, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select, desc, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.user import User
from app.models.chat import ChatSession, ChatMember, Message
from app.schemas.chat import ChatSessionCreate, ChatSessionResponse, MessageCreate, MessageResponse
from app.schemas.user import UserBrief
from app.services.chat_service import ChatService, MessagePermission
from app.services.ws_manager import manager

router = APIRouter()


@router.get('/permission')
async def check_message_permission(
    sender_id: int = Query(...),
    recipient_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Check if sender can message recipient and get permission status."""
    svc = ChatService(db)
    permission, reason = await svc.get_message_permission(sender_id, recipient_id)
    return {
        'permission': permission.value,
        'reason': reason,
        'can_message': permission in [MessagePermission.ALLOWED, MessagePermission.ONE_MESSAGE],
    }


@router.post('/sessions', response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    session_data: ChatSessionCreate,
    creator_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a new chat session (DM or group)."""
    all_member_ids = set(session_data.member_ids)
    all_member_ids.add(creator_id)

    # Verify all members exist
    for member_id in all_member_ids:
        user = await db.get(User, member_id)
        if not user:
            raise HTTPException(status_code=404, detail=f'User {member_id} not found')

    is_group = session_data.is_group or len(all_member_ids) > 2

    # For DMs: reuse existing session if it exists
    if not is_group and len(all_member_ids) == 2:
        other_id = next(m for m in all_member_ids if m != creator_id)
        svc = ChatService(db)
        
        # Check if DM already exists
        existing = await svc.get_dm_session(creator_id, other_id)
        if existing:
            return await get_session(existing.id, creator_id, db)

    # Create new session
    session = ChatSession(
        name=session_data.name,
        is_group=is_group,
        initiated_by=creator_id if not is_group else None,
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

    # Get last message (only text messages visible to this user)
    last_msg_result = await db.execute(
        select(Message)
        .where(
            and_(
                Message.session_id == session_id,
                Message.message_type == 'text',
                Message.status == 'sent',
                (Message.visible_to == None) | (Message.visible_to == user_id)
            )
        )
        .order_by(desc(Message.created_at))
        .limit(1)
    )
    last_msg = last_msg_result.scalar_one_or_none()

    # Get unread count (only count messages visible to this user, exclude system msgs)
    user_membership = next((m for m in session.members if m.user_id == user_id), None)
    unread_count = 0
    visibility_filter = and_(
        Message.session_id == session_id,
        Message.message_type == 'text',
        Message.status == 'sent',
        (Message.visible_to == None) | (Message.visible_to == user_id)
    )
    if user_membership and user_membership.last_read_message_id:
        unread_result = await db.scalar(
            select(func.count()).where(
                and_(
                    visibility_filter,
                    Message.id > user_membership.last_read_message_id,
                )
            )
        )
        unread_count = unread_result or 0
    elif last_msg:
        # Never read = count all visible text messages
        unread_result = await db.scalar(
            select(func.count()).where(visibility_filter)
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


@router.post('/sessions/{session_id}/messages', response_model=list[MessageResponse], status_code=status.HTTP_201_CREATED)
async def send_message(
    session_id: int,
    message_data: MessageCreate,
    sender_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Send a message to a chat session. Returns list of messages (user msg + optional system msg)."""
    from datetime import datetime as dt

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

    session = await db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail='Session not found')

    # Check message permission (DM only)
    svc = ChatService(db)
    can_send, reason = await svc.can_send_message(sender_id, session_id)
    
    # Determine message status and if we need a system warning
    msg_status = 'sent'
    is_cold_outreach = False
    
    if not session.is_group:
        # Get recipient for DMs
        members_result = await db.execute(
            select(ChatMember).where(ChatMember.session_id == session_id)
        )
        members = members_result.scalars().all()
        recipient_id = next((m.user_id for m in members if m.user_id != sender_id), None)
        
        if recipient_id:
            permission, _ = await svc.get_message_permission(sender_id, recipient_id)
            
            # Check if this is first cold outreach message
            if permission == MessagePermission.ONE_MESSAGE:
                is_cold_outreach = True
            elif permission == MessagePermission.WAITING:
                msg_status = 'pending'
            elif not can_send:
                raise HTTPException(status_code=403, detail=reason)
    elif not can_send:
        raise HTTPException(status_code=403, detail=reason)

    # Create user message
    message = Message(
        session_id=session_id,
        sender_id=sender_id,
        content=message_data.content,
        message_type='text',
        status=msg_status,
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)

    session.updated_at = dt.utcnow()

    responses = []
    
    # Build response for user message
    user_msg_response = MessageResponse(
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
        message_type='text',
        status=message.status,
        created_at=message.created_at,
    )
    responses.append(user_msg_response)

    # Broadcast user message to recipient (only if sent, not pending)
    if msg_status == 'sent':
        member_ids = [m.user_id for m in members] if not session.is_group else []
        if session.is_group:
            members_result = await db.execute(
                select(ChatMember).where(ChatMember.session_id == session_id)
            )
            member_ids = [m.user_id for m in members_result.scalars().all()]
        await manager.broadcast_to_session(
            member_ids,
            {'type': 'new_message', 'message': user_msg_response.model_dump(mode='json')},
            exclude_user=sender_id
        )

    # Create system message for cold outreach (visible only to sender)
    if is_cold_outreach:
        system_msg = Message(
            session_id=session_id,
            sender_id=sender_id,
            content='You can only send one message until they follow you or reply to you.',
            message_type='system',
            status='sent',
            visible_to=sender_id,
        )
        db.add(system_msg)
        await db.flush()
        await db.refresh(system_msg)

        system_response = MessageResponse(
            id=system_msg.id,
            session_id=system_msg.session_id,
            sender_id=system_msg.sender_id,
            sender=UserBrief(
                id=sender.id,
                name=sender.name,
                handle=sender.handle,
                avatar=sender.avatar,
                trust_score=sender.trust_score,
            ),
            content=system_msg.content,
            message_type='system',
            status='sent',
            created_at=system_msg.created_at,
        )
        responses.append(system_response)
        # Note: No WebSocket send for system msg - sender gets it from API response

    return responses


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

    # Check if conversation is established (other person has replied)
    svc = ChatService(db)
    other_replied = await svc.has_recipient_replied(session_id, user_id)

    # Build query with visibility filters:
    # - Show if status is 'sent' OR user is the sender (for pending)
    # - Show if visible_to is NULL (everyone) OR visible_to matches user (for system msgs)
    query = select(Message).where(
        and_(
            Message.session_id == session_id,
            (Message.status == 'sent') | (Message.sender_id == user_id),
            (Message.visible_to == None) | (Message.visible_to == user_id)
        )
    )
    if before_id:
        query = query.where(Message.id < before_id)
    query = query.order_by(desc(Message.id)).limit(limit)

    result = await db.execute(query)
    messages = result.scalars().all()

    # Filter out system warnings if conversation is established
    if other_replied:
        messages = [m for m in messages if m.message_type != 'system']

    # Get senders
    sender_ids = list(set(m.sender_id for m in messages))
    if not sender_ids:
        return []
    senders_result = await db.execute(select(User).where(User.id.in_(sender_ids)))
    senders = {u.id: u for u in senders_result.scalars().all()}

    # Mark as read (update last_read_message_id) - only count 'sent' text messages
    sent_messages = [m for m in messages if m.status == 'sent' and m.message_type == 'text']
    if sent_messages:
        latest_id = max(m.id for m in sent_messages)
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
            message_type=m.message_type,
            status=m.status,
            created_at=m.created_at,
        )
        for m in messages
        if m.sender_id in senders
    ]


@router.websocket('/ws/{user_id}')
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    """WebSocket endpoint for real-time chat updates."""
    await manager.connect(websocket, user_id)
    try:
        while True:
            # Wait for any message (text, ping, etc.) to keep connection alive
            message = await websocket.receive()
            # Handle text messages if needed (typing indicators, etc.)
            if message.get('type') == 'websocket.disconnect':
                break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f'[WS] Error for user {user_id}: {e}')
    finally:
        manager.disconnect(websocket, user_id)
