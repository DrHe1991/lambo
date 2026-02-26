import secrets
from datetime import datetime as dt, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select, desc, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.user import User, Follow
from app.models.chat import ChatSession, ChatMember, Message, MessageReaction, GroupInviteLink, JoinRequest
from app.schemas.chat import (
    ChatSessionCreate, ChatSessionResponse, ChatSessionUpdate, MessageCreate, MessageResponse,
    ReactionCreate, ReactionResponse, ReactionInfo, ReplyInfo, GroupDetailResponse, MemberInfo,
    AddMembersRequest, UpdateRoleRequest, MuteRequest, TransferOwnershipRequest,
    InviteLinkCreate, InviteLinkResponse, InvitePreviewResponse, JoinRequestResponse, JoinRequestAction
)
from app.schemas.user import UserBrief
from app.services.chat_service import ChatService, MessagePermission
from app.services.ws_manager import manager


# Helper functions for permission checks
async def get_member_role(db: AsyncSession, session_id: int, user_id: int) -> str | None:
    """Get a user's role in a session. Returns None if not a member."""
    result = await db.execute(
        select(ChatMember).where(
            and_(
                ChatMember.session_id == session_id,
                ChatMember.user_id == user_id,
                ChatMember.left_at == None
            )
        )
    )
    member = result.scalar_one_or_none()
    return member.role if member else None


async def require_role(db: AsyncSession, session_id: int, user_id: int, min_role: str) -> ChatMember:
    """Require user to have at least min_role. Returns membership if valid."""
    result = await db.execute(
        select(ChatMember).where(
            and_(
                ChatMember.session_id == session_id,
                ChatMember.user_id == user_id,
                ChatMember.left_at == None
            )
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail='Not a member of this chat')

    role_order = {'owner': 3, 'admin': 2, 'member': 1}
    if role_order.get(member.role, 0) < role_order.get(min_role, 0):
        raise HTTPException(status_code=403, detail=f'Requires {min_role} or higher')

    return member


async def create_system_message(db: AsyncSession, session_id: int, content: str, visible_to: int | None = None):
    """Create a system message and broadcast it."""
    msg = Message(
        session_id=session_id,
        sender_id=None,  # System messages have no sender
        content=content,
        message_type='system',
        status='sent',
        visible_to=visible_to,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)

    # Broadcast to all members
    members_result = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
        )
    )
    member_ids = [m.user_id for m in members_result.scalars().all()]
    if visible_to:
        member_ids = [visible_to]

    await manager.broadcast_to_session(
        member_ids,
        {
            'type': 'new_message',
            'message': {
                'id': msg.id,
                'session_id': session_id,
                'sender_id': None,
                'content': content,
                'message_type': 'system',
                'status': 'sent',
                'created_at': msg.created_at.isoformat(),
            }
        }
    )
    return msg

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
    creator = await db.get(User, creator_id)
    if not creator:
        raise HTTPException(status_code=404, detail='Creator not found')

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
        owner_id=creator_id if is_group else None,
        avatar=session_data.avatar,
        description=session_data.description,
    )
    db.add(session)
    await db.flush()

    # Add members with roles
    for member_id in all_member_ids:
        role = 'owner' if (is_group and member_id == creator_id) else 'member'
        member = ChatMember(
            session_id=session.id,
            user_id=member_id,
            role=role,
            invited_by=creator_id if member_id != creator_id else None
        )
        db.add(member)

    await db.flush()

    # Create system message for group creation
    if is_group:
        await create_system_message(db, session.id, f'{creator.name} created the group')

    return await get_session(session.id, creator_id, db)


@router.get('/sessions', response_model=list[ChatSessionResponse])
async def get_sessions(
    user_id: int = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get all chat sessions for a user (including left groups for history)."""
    # Get all sessions where user is/was a member
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
    # Verify user is/was a member (allow viewing history even if left)
    membership_result = await db.execute(
        select(ChatMember).where(
            and_(
                ChatMember.session_id == session_id,
                ChatMember.user_id == user_id,
            )
        )
    )
    user_membership_record = membership_result.scalar_one_or_none()
    if not user_membership_record:
        raise HTTPException(status_code=403, detail='Not a member of this chat')
    
    user_has_left = user_membership_record.left_at is not None

    # Get session with members
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.members))
        .where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail='Session not found')

    # Get active member users only (not left)
    active_members = [m for m in session.members if m.left_at is None]
    member_ids = [m.user_id for m in active_members]
    members_result = await db.execute(select(User).where(User.id.in_(member_ids)))
    members = members_result.scalars().all()

    # For users who have left, get the last message they can see (before or at left_at)
    # Also include system messages visible_to them
    if user_has_left:
        # Get the last message visible to this user (either visible_to them or before they left)
        last_msg_result = await db.execute(
            select(Message)
            .where(
                and_(
                    Message.session_id == session_id,
                    Message.status == 'sent',
                    ((Message.visible_to == None) & (Message.created_at <= user_membership_record.left_at)) |
                    (Message.visible_to == user_id)
                )
            )
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()
        unread_count = 0  # No unread for users who left
    else:
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
        user_membership = next((m for m in session.members if m.user_id == user_id and m.left_at is None), None)
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
        avatar=session.avatar,
        description=session.description,
        owner_id=session.owner_id,
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
        who_can_send=session.who_can_send,
        who_can_add=session.who_can_add,
        join_approval=session.join_approval,
        member_limit=session.member_limit,
        created_at=session.created_at,
        user_has_left=user_has_left,
    )


@router.post('/sessions/{session_id}/messages', response_model=list[MessageResponse], status_code=status.HTTP_201_CREATED)
async def send_message(
    session_id: int,
    message_data: MessageCreate,
    sender_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Send a message to a chat session. Returns list of messages (user msg + optional system msg)."""
    # Verify sender is active member (not left)
    membership_result = await db.execute(
        select(ChatMember).where(
            and_(
                ChatMember.session_id == session_id,
                ChatMember.user_id == sender_id,
                ChatMember.left_at == None
            )
        )
    )
    membership = membership_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this chat')

    sender = await db.get(User, sender_id)
    if not sender:
        raise HTTPException(status_code=404, detail='Sender not found')

    session = await db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail='Session not found')

    # Group-specific checks
    if session.is_group:
        # Check if muted
        if membership.is_muted:
            if membership.muted_until and membership.muted_until > dt.utcnow():
                raise HTTPException(status_code=403, detail='You are muted in this group')
            elif membership.muted_until is None:
                raise HTTPException(status_code=403, detail='You are muted in this group')
            else:
                # Mute expired, clear it
                membership.is_muted = False
                membership.muted_until = None

        # Check who_can_send permission
        if session.who_can_send == 'admins_only' and membership.role not in ('owner', 'admin'):
            raise HTTPException(status_code=403, detail='Only admins can send messages in this group')

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

    # Build reply info if replying to a message
    reply_info = None
    if message_data.reply_to_id:
        reply_msg = await db.get(Message, message_data.reply_to_id)
        if reply_msg:
            reply_sender = await db.get(User, reply_msg.sender_id)
            reply_info = ReplyInfo(
                id=reply_msg.id,
                content=reply_msg.content,
                sender_id=reply_msg.sender_id,
                sender_name=reply_sender.name if reply_sender else 'Unknown',
            )

    # Create user message
    message = Message(
        session_id=session_id,
        sender_id=sender_id,
        content=message_data.content,
        message_type='text',
        status=msg_status,
        reply_to_id=message_data.reply_to_id,
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
        reply_to=reply_info,
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
    # Verify user is/was member
    membership_result = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.user_id == user_id)
        )
    )
    membership = membership_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this chat')

    user_has_left = membership.left_at is not None

    # Check if conversation is established (other person has replied)
    svc = ChatService(db)
    other_replied = await svc.has_recipient_replied(session_id, user_id)

    # Build query with visibility filters:
    # - Show if status is 'sent' OR user is the sender (for pending)
    # - Show if visible_to is NULL (everyone) OR visible_to matches user (for system msgs)
    # - For users who left: only show messages before they left OR visible_to them
    if user_has_left:
        query = select(Message).where(
            and_(
                Message.session_id == session_id,
                (Message.status == 'sent') | (Message.sender_id == user_id),
                ((Message.visible_to == None) & (Message.created_at <= membership.left_at)) |
                (Message.visible_to == user_id)
            )
        )
    else:
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

    # Get reactions for all messages
    message_ids = [m.id for m in messages]
    reactions_result = await db.execute(
        select(MessageReaction, User)
        .join(User, MessageReaction.user_id == User.id)
        .where(MessageReaction.message_id.in_(message_ids))
    )
    reactions_data = reactions_result.all()
    
    # Group reactions by message_id
    reactions_by_msg: dict[int, list[ReactionInfo]] = {}
    for reaction, user in reactions_data:
        if reaction.message_id not in reactions_by_msg:
            reactions_by_msg[reaction.message_id] = []
        reactions_by_msg[reaction.message_id].append(
            ReactionInfo(emoji=reaction.emoji, user_id=user.id, user_name=user.name)
        )

    # Build reply info map for messages that are replies
    reply_to_ids = [m.reply_to_id for m in messages if m.reply_to_id]
    replies_by_id: dict[int, ReplyInfo] = {}
    if reply_to_ids:
        reply_msgs_result = await db.execute(
            select(Message, User)
            .join(User, Message.sender_id == User.id)
            .where(Message.id.in_(reply_to_ids))
        )
        for reply_msg, reply_sender in reply_msgs_result.all():
            replies_by_id[reply_msg.id] = ReplyInfo(
                id=reply_msg.id,
                content=reply_msg.content,
                sender_id=reply_sender.id,
                sender_name=reply_sender.name,
            )

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
            reply_to=replies_by_id.get(m.reply_to_id) if m.reply_to_id else None,
            reactions=reactions_by_msg.get(m.id, []),
            created_at=m.created_at,
        )
        for m in messages
        if m.sender_id in senders
    ]


@router.post('/messages/{message_id}/reactions', response_model=ReactionResponse, status_code=status.HTTP_201_CREATED)
async def add_reaction(
    message_id: int,
    reaction_data: ReactionCreate,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Add a reaction to a message."""
    # Get message and verify user is member of session
    message = await db.get(Message, message_id)
    if not message:
        raise HTTPException(status_code=404, detail='Message not found')

    membership = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == message.session_id, ChatMember.user_id == user_id)
        )
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail='Not a member of this chat')

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    # Check if user already reacted with this emoji - if so, remove it (toggle)
    existing = await db.execute(
        select(MessageReaction).where(
            and_(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == user_id,
                MessageReaction.emoji == reaction_data.emoji
            )
        )
    )
    existing_reaction = existing.scalar_one_or_none()

    members_result = await db.execute(
        select(ChatMember).where(ChatMember.session_id == message.session_id)
    )
    member_ids = [m.user_id for m in members_result.scalars().all()]

    if existing_reaction:
        await db.delete(existing_reaction)
        await db.flush()
        # Broadcast removal to others only (sender uses optimistic update)
        await manager.broadcast_to_session(
            member_ids,
            {
                'type': 'reaction_removed',
                'message_id': message_id,
                'user_id': user_id,
                'emoji': reaction_data.emoji,
            },
            exclude_user=user_id
        )
        return ReactionResponse(
            id=existing_reaction.id,
            message_id=message_id,
            user_id=user_id,
            emoji=reaction_data.emoji,
            created_at=existing_reaction.created_at
        )

    # Add new reaction
    reaction = MessageReaction(
        message_id=message_id,
        user_id=user_id,
        emoji=reaction_data.emoji
    )
    db.add(reaction)
    await db.flush()
    await db.refresh(reaction)

    # Broadcast to others only (sender uses optimistic update)
    await manager.broadcast_to_session(
        member_ids,
        {
            'type': 'reaction_added',
            'message_id': message_id,
            'user_id': user_id,
            'user_name': user.name,
            'emoji': reaction_data.emoji,
        },
        exclude_user=user_id
    )

    return ReactionResponse(
        id=reaction.id,
        message_id=reaction.message_id,
        user_id=reaction.user_id,
        emoji=reaction.emoji,
        created_at=reaction.created_at
    )


@router.delete('/messages/{message_id}/reactions')
async def remove_reaction(
    message_id: int,
    emoji: str = Query(...),
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Remove a reaction from a message."""
    message = await db.get(Message, message_id)
    if not message:
        raise HTTPException(status_code=404, detail='Message not found')

    # Find and delete reaction
    result = await db.execute(
        select(MessageReaction).where(
            and_(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == user_id,
                MessageReaction.emoji == emoji
            )
        )
    )
    reaction = result.scalar_one_or_none()
    if not reaction:
        raise HTTPException(status_code=404, detail='Reaction not found')

    await db.delete(reaction)

    # Broadcast removal
    members_result = await db.execute(
        select(ChatMember).where(ChatMember.session_id == message.session_id)
    )
    member_ids = [m.user_id for m in members_result.scalars().all()]
    await manager.broadcast_to_session(
        member_ids,
        {
            'type': 'reaction_removed',
            'message_id': message_id,
            'user_id': user_id,
            'emoji': emoji,
        }
    )

    return {'status': 'removed'}


# ==================== GROUP MANAGEMENT ENDPOINTS ====================

@router.get('/sessions/{session_id}/detail', response_model=GroupDetailResponse)
async def get_group_detail(
    session_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed group info with full member list and roles."""
    membership = await require_role(db, session_id, user_id, 'member')

    session = await db.get(ChatSession, session_id)
    if not session or not session.is_group:
        raise HTTPException(status_code=404, detail='Group not found')

    # Get all active members with user info
    members_result = await db.execute(
        select(ChatMember, User)
        .join(User, ChatMember.user_id == User.id)
        .where(
            and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
        )
        .order_by(
            # Owner first, then admins, then members
            case(
                (ChatMember.role == 'owner', 0),
                (ChatMember.role == 'admin', 1),
                else_=2
            ),
            ChatMember.joined_at
        )
    )
    members_data = members_result.all()

    members = [
        MemberInfo(
            user=UserBrief(
                id=user.id,
                name=user.name,
                handle=user.handle,
                avatar=user.avatar,
                trust_score=user.trust_score,
            ),
            role=member.role,
            is_muted=member.is_muted,
            joined_at=member.joined_at,
        )
        for member, user in members_data
    ]

    return GroupDetailResponse(
        id=session.id,
        name=session.name,
        avatar=session.avatar,
        description=session.description,
        owner_id=session.owner_id,
        members=members,
        member_count=len(members),
        who_can_send=session.who_can_send,
        who_can_add=session.who_can_add,
        join_approval=session.join_approval,
        member_limit=session.member_limit,
        my_role=membership.role,
        created_at=session.created_at,
    )


@router.patch('/sessions/{session_id}', response_model=ChatSessionResponse)
async def update_group(
    session_id: int,
    update_data: ChatSessionUpdate,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Update group settings (admin+ only)."""
    await require_role(db, session_id, user_id, 'admin')

    session = await db.get(ChatSession, session_id)
    if not session or not session.is_group:
        raise HTTPException(status_code=404, detail='Group not found')

    user = await db.get(User, user_id)
    changes = []

    if update_data.name is not None and update_data.name != session.name:
        old_name = session.name or 'Unnamed Group'
        session.name = update_data.name
        changes.append(f'{user.name} renamed the group to "{update_data.name}"')

    if update_data.avatar is not None:
        session.avatar = update_data.avatar
    if update_data.description is not None:
        session.description = update_data.description
    if update_data.who_can_send is not None:
        session.who_can_send = update_data.who_can_send
    if update_data.who_can_add is not None:
        session.who_can_add = update_data.who_can_add
    if update_data.join_approval is not None:
        session.join_approval = update_data.join_approval
    if update_data.member_limit is not None:
        session.member_limit = update_data.member_limit

    await db.flush()

    # Broadcast system messages for visible changes
    for change in changes:
        await create_system_message(db, session_id, change)

    # Broadcast group_updated event
    members_result = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
        )
    )
    member_ids = [m.user_id for m in members_result.scalars().all()]
    await manager.broadcast_to_session(
        member_ids,
        {'type': 'group_updated', 'session_id': session_id}
    )

    return await get_session(session_id, user_id, db)


@router.delete('/sessions/{session_id}')
async def delete_group(
    session_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Delete a group (owner only)."""
    await require_role(db, session_id, user_id, 'owner')

    session = await db.get(ChatSession, session_id)
    if not session or not session.is_group:
        raise HTTPException(status_code=404, detail='Group not found')

    # Broadcast deletion to all members before deleting
    members_result = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
        )
    )
    member_ids = [m.user_id for m in members_result.scalars().all()]
    await manager.broadcast_to_session(
        member_ids,
        {'type': 'group_deleted', 'session_id': session_id}
    )

    # Delete the session (cascades to members, messages, invite links)
    await db.delete(session)
    await db.flush()

    return {'status': 'deleted'}


@router.post('/sessions/{session_id}/members')
async def add_members(
    session_id: int,
    request: AddMembersRequest,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Add members to a group."""
    membership = await require_role(db, session_id, user_id, 'member')

    session = await db.get(ChatSession, session_id)
    if not session or not session.is_group:
        raise HTTPException(status_code=404, detail='Group not found')

    # Check permission based on group settings
    if session.who_can_add == 'admins_only' and membership.role == 'member':
        raise HTTPException(status_code=403, detail='Only admins can add members')

    # Check member limit
    current_count = await db.scalar(
        select(func.count()).where(
            and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
        )
    )
    if session.member_limit and current_count + len(request.user_ids) > session.member_limit:
        raise HTTPException(status_code=400, detail=f'Member limit ({session.member_limit}) would be exceeded')

    inviter = await db.get(User, user_id)
    added_names = []
    rejoined_user_ids = []

    for new_user_id in request.user_ids:
        # Check if user exists
        user = await db.get(User, new_user_id)
        if not user:
            continue

        # Check if already a member
        existing = await db.execute(
            select(ChatMember).where(
                and_(ChatMember.session_id == session_id, ChatMember.user_id == new_user_id)
            )
        )
        existing_member = existing.scalar_one_or_none()

        if existing_member:
            if existing_member.left_at:
                # Rejoin - reactivate membership
                existing_member.left_at = None
                existing_member.joined_at = dt.utcnow()
                existing_member.invited_by = user_id
                added_names.append(user.name)
                rejoined_user_ids.append(new_user_id)
            # else: already active member, skip
        else:
            # New member
            member = ChatMember(
                session_id=session_id,
                user_id=new_user_id,
                role='member',
                invited_by=user_id,
            )
            db.add(member)
            added_names.append(user.name)

    await db.flush()

    if added_names:
        names_str = ', '.join(added_names)
        await create_system_message(db, session_id, f'{inviter.name} added {names_str}')
        
        # Personal welcome message for rejoining users
        for rejoined_id in rejoined_user_ids:
            await create_system_message(
                db, session_id,
                f'You rejoined "{session.name or "this group"}" invited by {inviter.name}',
                visible_to=rejoined_id
            )

        # Broadcast to all members
        members_result = await db.execute(
            select(ChatMember).where(
                and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
            )
        )
        member_ids = [m.user_id for m in members_result.scalars().all()]
        await manager.broadcast_to_session(
            member_ids,
            {'type': 'members_added', 'session_id': session_id, 'count': len(added_names)}
        )

    return {'added': len(added_names)}


@router.delete('/sessions/{session_id}/members/{target_user_id}')
async def remove_member(
    session_id: int,
    target_user_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from a group (admin+ only, cannot remove owner)."""
    await require_role(db, session_id, user_id, 'admin')

    session = await db.get(ChatSession, session_id)
    if not session or not session.is_group:
        raise HTTPException(status_code=404, detail='Group not found')

    # Cannot remove owner
    if target_user_id == session.owner_id:
        raise HTTPException(status_code=403, detail='Cannot remove the group owner')

    # Find target membership
    target_result = await db.execute(
        select(ChatMember).where(
            and_(
                ChatMember.session_id == session_id,
                ChatMember.user_id == target_user_id,
                ChatMember.left_at == None
            )
        )
    )
    target_member = target_result.scalar_one_or_none()
    if not target_member:
        raise HTTPException(status_code=404, detail='Member not found')

    # Admins cannot remove other admins (only owner can)
    my_role = await get_member_role(db, session_id, user_id)
    if target_member.role == 'admin' and my_role != 'owner':
        raise HTTPException(status_code=403, detail='Only owner can remove admins')

    # Soft delete
    target_member.left_at = dt.utcnow()
    await db.flush()

    remover = await db.get(User, user_id)
    target_user = await db.get(User, target_user_id)
    
    # System message visible to everyone (including removed user)
    await create_system_message(db, session_id, f'{remover.name} removed {target_user.name}')
    
    # Personal message visible only to the removed user
    await create_system_message(db, session_id, 'You were removed from this group', visible_to=target_user_id)

    # Broadcast to all remaining members
    members_result = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
        )
    )
    member_ids = [m.user_id for m in members_result.scalars().all()]
    await manager.broadcast_to_session(
        member_ids,
        {'type': 'member_removed', 'session_id': session_id, 'user_id': target_user_id}
    )
    
    # Also notify the removed user so their UI updates
    await manager.broadcast_to_session(
        [target_user_id],
        {'type': 'you_were_removed', 'session_id': session_id}
    )

    return {'status': 'removed'}


@router.post('/sessions/{session_id}/leave')
async def leave_group(
    session_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Leave a group chat."""
    membership = await require_role(db, session_id, user_id, 'member')

    session = await db.get(ChatSession, session_id)
    if not session or not session.is_group:
        raise HTTPException(status_code=404, detail='Group not found')

    user = await db.get(User, user_id)

    # If owner is leaving, transfer ownership
    if membership.role == 'owner':
        # Find next owner: first admin by join date, or first member
        next_owner_result = await db.execute(
            select(ChatMember)
            .where(
                and_(
                    ChatMember.session_id == session_id,
                    ChatMember.user_id != user_id,
                    ChatMember.left_at == None
                )
            )
            .order_by(
                case((ChatMember.role == 'admin', 0), else_=1),
                ChatMember.joined_at
            )
            .limit(1)
        )
        next_owner = next_owner_result.scalar_one_or_none()

        if next_owner:
            # Transfer ownership
            next_owner.role = 'owner'
            session.owner_id = next_owner.user_id
            new_owner_user = await db.get(User, next_owner.user_id)
            await create_system_message(
                db, session_id,
                f'{user.name} left. {new_owner_user.name} is now the owner'
            )
        else:
            # Last member leaving - delete the group
            await db.delete(session)
            await db.flush()
            return {'status': 'group_deleted'}

    # Soft delete membership
    membership.left_at = dt.utcnow()
    await db.flush()

    await create_system_message(db, session_id, f'{user.name} left the group')

    # Broadcast
    members_result = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
        )
    )
    member_ids = [m.user_id for m in members_result.scalars().all()]
    await manager.broadcast_to_session(
        member_ids,
        {'type': 'member_left', 'session_id': session_id, 'user_id': user_id}
    )

    return {'status': 'left'}


@router.patch('/sessions/{session_id}/members/{target_user_id}/role')
async def update_member_role(
    session_id: int,
    target_user_id: int,
    request: UpdateRoleRequest,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Promote/demote a member (owner only)."""
    await require_role(db, session_id, user_id, 'owner')

    # Cannot change owner's role
    session = await db.get(ChatSession, session_id)
    if target_user_id == session.owner_id:
        raise HTTPException(status_code=400, detail='Cannot change owner role. Use transfer instead.')

    # Find target membership
    target_result = await db.execute(
        select(ChatMember).where(
            and_(
                ChatMember.session_id == session_id,
                ChatMember.user_id == target_user_id,
                ChatMember.left_at == None
            )
        )
    )
    target_member = target_result.scalar_one_or_none()
    if not target_member:
        raise HTTPException(status_code=404, detail='Member not found')

    old_role = target_member.role
    target_member.role = request.role
    await db.flush()

    owner = await db.get(User, user_id)
    target_user = await db.get(User, target_user_id)

    if request.role == 'admin' and old_role == 'member':
        await create_system_message(db, session_id, f'{owner.name} made {target_user.name} an admin')
    elif request.role == 'member' and old_role == 'admin':
        await create_system_message(db, session_id, f'{owner.name} removed {target_user.name} as admin')

    # Broadcast
    members_result = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
        )
    )
    member_ids = [m.user_id for m in members_result.scalars().all()]
    await manager.broadcast_to_session(
        member_ids,
        {'type': 'role_changed', 'session_id': session_id, 'user_id': target_user_id, 'role': request.role}
    )

    return {'status': 'updated', 'role': request.role}


@router.patch('/sessions/{session_id}/members/{target_user_id}/mute')
async def mute_member(
    session_id: int,
    target_user_id: int,
    request: MuteRequest,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Mute/unmute a member (admin+ only)."""
    await require_role(db, session_id, user_id, 'admin')

    session = await db.get(ChatSession, session_id)
    if target_user_id == session.owner_id:
        raise HTTPException(status_code=403, detail='Cannot mute the owner')

    # Find target membership
    target_result = await db.execute(
        select(ChatMember).where(
            and_(
                ChatMember.session_id == session_id,
                ChatMember.user_id == target_user_id,
                ChatMember.left_at == None
            )
        )
    )
    target_member = target_result.scalar_one_or_none()
    if not target_member:
        raise HTTPException(status_code=404, detail='Member not found')

    target_member.is_muted = request.is_muted
    if request.is_muted and request.duration_hours:
        target_member.muted_until = dt.utcnow() + timedelta(hours=request.duration_hours)
    else:
        target_member.muted_until = None

    await db.flush()

    admin = await db.get(User, user_id)
    target_user = await db.get(User, target_user_id)
    action = 'muted' if request.is_muted else 'unmuted'
    # Mute messages visible only to admins
    await create_system_message(db, session_id, f'{admin.name} {action} {target_user.name}')

    return {'status': action}


@router.post('/sessions/{session_id}/transfer')
async def transfer_ownership(
    session_id: int,
    request: TransferOwnershipRequest,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Transfer group ownership (owner only)."""
    await require_role(db, session_id, user_id, 'owner')

    session = await db.get(ChatSession, session_id)
    if not session or not session.is_group:
        raise HTTPException(status_code=404, detail='Group not found')

    # Find new owner membership
    new_owner_result = await db.execute(
        select(ChatMember).where(
            and_(
                ChatMember.session_id == session_id,
                ChatMember.user_id == request.new_owner_id,
                ChatMember.left_at == None
            )
        )
    )
    new_owner_member = new_owner_result.scalar_one_or_none()
    if not new_owner_member:
        raise HTTPException(status_code=404, detail='New owner must be a group member')

    # Find current owner membership
    current_owner_result = await db.execute(
        select(ChatMember).where(
            and_(
                ChatMember.session_id == session_id,
                ChatMember.user_id == user_id,
                ChatMember.left_at == None
            )
        )
    )
    current_owner_member = current_owner_result.scalar_one_or_none()

    # Transfer
    current_owner_member.role = 'admin'
    new_owner_member.role = 'owner'
    session.owner_id = request.new_owner_id
    await db.flush()

    old_owner = await db.get(User, user_id)
    new_owner = await db.get(User, request.new_owner_id)
    await create_system_message(
        db, session_id,
        f'{old_owner.name} transferred ownership to {new_owner.name}'
    )

    # Broadcast
    members_result = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
        )
    )
    member_ids = [m.user_id for m in members_result.scalars().all()]
    await manager.broadcast_to_session(
        member_ids,
        {'type': 'ownership_transferred', 'session_id': session_id, 'new_owner_id': request.new_owner_id}
    )

    return {'status': 'transferred'}


# ==================== INVITE LINK ENDPOINTS ====================

@router.post('/sessions/{session_id}/invite-link', response_model=InviteLinkResponse)
async def create_invite_link(
    session_id: int,
    request: InviteLinkCreate,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Create an invite link for a group (admin+ only)."""
    await require_role(db, session_id, user_id, 'admin')

    session = await db.get(ChatSession, session_id)
    if not session or not session.is_group:
        raise HTTPException(status_code=404, detail='Group not found')

    # Generate unique code
    code = secrets.token_urlsafe(8)[:10]

    expires_at = None
    if request.expires_in_days:
        expires_at = dt.utcnow() + timedelta(days=request.expires_in_days)

    link = GroupInviteLink(
        session_id=session_id,
        created_by=user_id,
        code=code,
        expires_at=expires_at,
        max_uses=request.max_uses,
    )
    db.add(link)
    await db.flush()
    await db.refresh(link)

    return InviteLinkResponse(
        id=link.id,
        code=link.code,
        expires_at=link.expires_at,
        max_uses=link.max_uses,
        use_count=link.use_count,
        is_active=link.is_active,
        created_at=link.created_at,
    )


@router.get('/sessions/{session_id}/invite-links', response_model=list[InviteLinkResponse])
async def get_invite_links(
    session_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get all active invite links for a group (admin+ only)."""
    await require_role(db, session_id, user_id, 'admin')

    result = await db.execute(
        select(GroupInviteLink)
        .where(
            and_(
                GroupInviteLink.session_id == session_id,
                GroupInviteLink.is_active == True
            )
        )
        .order_by(desc(GroupInviteLink.created_at))
    )
    links = result.scalars().all()

    return [
        InviteLinkResponse(
            id=link.id,
            code=link.code,
            expires_at=link.expires_at,
            max_uses=link.max_uses,
            use_count=link.use_count,
            is_active=link.is_active,
            created_at=link.created_at,
        )
        for link in links
    ]


@router.delete('/invite-links/{code}')
async def revoke_invite_link(
    code: str,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an invite link (admin+ only)."""
    result = await db.execute(
        select(GroupInviteLink).where(GroupInviteLink.code == code)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail='Invite link not found')

    await require_role(db, link.session_id, user_id, 'admin')

    link.is_active = False
    await db.flush()

    return {'status': 'revoked'}


@router.get('/invite/{code}/preview', response_model=InvitePreviewResponse)
async def preview_invite(
    code: str,
    db: AsyncSession = Depends(get_db),
):
    """Preview a group from an invite link (no auth required)."""
    result = await db.execute(
        select(GroupInviteLink).where(GroupInviteLink.code == code)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail='Invite link not found')

    if not link.is_active:
        raise HTTPException(status_code=410, detail='Invite link has been revoked')

    if link.expires_at and link.expires_at < dt.utcnow():
        raise HTTPException(status_code=410, detail='Invite link has expired')

    if link.max_uses and link.use_count >= link.max_uses:
        raise HTTPException(status_code=410, detail='Invite link has reached max uses')

    session = await db.get(ChatSession, link.session_id)
    member_count = await db.scalar(
        select(func.count()).where(
            and_(ChatMember.session_id == link.session_id, ChatMember.left_at == None)
        )
    )

    return InvitePreviewResponse(
        group_name=session.name,
        avatar=session.avatar,
        description=session.description,
        member_count=member_count,
        requires_approval=session.join_approval,
    )


@router.post('/join/{code}')
async def join_via_invite(
    code: str,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Join a group via invite link."""
    result = await db.execute(
        select(GroupInviteLink).where(GroupInviteLink.code == code)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail='Invite link not found')

    if not link.is_active:
        raise HTTPException(status_code=410, detail='Invite link has been revoked')

    if link.expires_at and link.expires_at < dt.utcnow():
        raise HTTPException(status_code=410, detail='Invite link has expired')

    if link.max_uses and link.use_count >= link.max_uses:
        raise HTTPException(status_code=410, detail='Invite link has reached max uses')

    session = await db.get(ChatSession, link.session_id)
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    # Check if already a member
    existing = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == link.session_id, ChatMember.user_id == user_id)
        )
    )
    existing_member = existing.scalar_one_or_none()

    if existing_member:
        if existing_member.left_at:
            if session.join_approval:
                # Need approval to rejoin
                pass
            else:
                # Rejoin directly
                existing_member.left_at = None
                existing_member.joined_at = dt.utcnow()
                link.use_count += 1
                await db.flush()
                await create_system_message(db, link.session_id, f'{user.name} rejoined via invite link')
                return {'status': 'joined', 'session_id': link.session_id}
        else:
            raise HTTPException(status_code=400, detail='Already a member of this group')

    # Check if already has pending request
    pending_result = await db.execute(
        select(JoinRequest).where(
            and_(
                JoinRequest.session_id == link.session_id,
                JoinRequest.user_id == user_id,
                JoinRequest.status == 'pending'
            )
        )
    )
    if pending_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail='You already have a pending join request')

    # If join_approval is required, create a pending request
    if session.join_approval:
        join_request = JoinRequest(
            session_id=link.session_id,
            user_id=user_id,
            invite_code=code,
        )
        db.add(join_request)
        await db.flush()

        # Notify admins via WebSocket
        admins_result = await db.execute(
            select(ChatMember).where(
                and_(
                    ChatMember.session_id == link.session_id,
                    ChatMember.role.in_(['owner', 'admin']),
                    ChatMember.left_at == None
                )
            )
        )
        admin_ids = [m.user_id for m in admins_result.scalars().all()]
        await manager.broadcast_to_session(
            admin_ids,
            {'type': 'join_request', 'session_id': link.session_id, 'user_id': user_id, 'user_name': user.name}
        )

        return {'status': 'pending', 'session_id': link.session_id}

    # No approval needed - join directly
    member_count = await db.scalar(
        select(func.count()).where(
            and_(ChatMember.session_id == link.session_id, ChatMember.left_at == None)
        )
    )
    if session.member_limit and member_count >= session.member_limit:
        raise HTTPException(status_code=400, detail='Group is full')

    member = ChatMember(
        session_id=link.session_id,
        user_id=user_id,
        role='member',
    )
    db.add(member)
    link.use_count += 1
    await db.flush()

    await create_system_message(db, link.session_id, f'{user.name} joined via invite link')

    # Broadcast
    members_result = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.session_id == link.session_id, ChatMember.left_at == None)
        )
    )
    member_ids = [m.user_id for m in members_result.scalars().all()]
    await manager.broadcast_to_session(
        member_ids,
        {'type': 'member_joined', 'session_id': link.session_id, 'user_id': user_id}
    )

    return {'status': 'joined', 'session_id': link.session_id}


# ==================== JOIN REQUEST ENDPOINTS ====================

@router.get('/sessions/{session_id}/join-requests', response_model=list[JoinRequestResponse])
async def get_join_requests(
    session_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get pending join requests for a group (admin+ only)."""
    await require_role(db, session_id, user_id, 'admin')

    result = await db.execute(
        select(JoinRequest, User)
        .join(User, JoinRequest.user_id == User.id)
        .where(
            and_(
                JoinRequest.session_id == session_id,
                JoinRequest.status == 'pending'
            )
        )
        .order_by(JoinRequest.created_at)
    )
    requests_data = result.all()

    return [
        JoinRequestResponse(
            id=req.id,
            session_id=req.session_id,
            user=UserBrief(
                id=user.id,
                name=user.name,
                handle=user.handle,
                avatar=user.avatar,
                trust_score=user.trust_score,
            ),
            invite_code=req.invite_code,
            status=req.status,
            created_at=req.created_at,
        )
        for req, user in requests_data
    ]


@router.post('/sessions/{session_id}/join-requests/{request_id}')
async def handle_join_request(
    session_id: int,
    request_id: int,
    action_data: JoinRequestAction,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a join request (admin+ only)."""
    await require_role(db, session_id, user_id, 'admin')

    join_request = await db.get(JoinRequest, request_id)
    if not join_request or join_request.session_id != session_id:
        raise HTTPException(status_code=404, detail='Join request not found')

    if join_request.status != 'pending':
        raise HTTPException(status_code=400, detail='Request already processed')

    session = await db.get(ChatSession, session_id)
    requester = await db.get(User, join_request.user_id)
    admin = await db.get(User, user_id)

    if action_data.action == 'approve':
        # Check member limit
        member_count = await db.scalar(
            select(func.count()).where(
                and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
            )
        )
        if session.member_limit and member_count >= session.member_limit:
            raise HTTPException(status_code=400, detail='Group is full')

        # Check if they were a previous member (rejoin)
        existing = await db.execute(
            select(ChatMember).where(
                and_(ChatMember.session_id == session_id, ChatMember.user_id == join_request.user_id)
            )
        )
        existing_member = existing.scalar_one_or_none()

        if existing_member:
            existing_member.left_at = None
            existing_member.joined_at = dt.utcnow()
        else:
            member = ChatMember(
                session_id=session_id,
                user_id=join_request.user_id,
                role='member',
            )
            db.add(member)

        join_request.status = 'approved'
        join_request.resolved_at = dt.utcnow()
        join_request.resolved_by = user_id

        await db.flush()

        await create_system_message(db, session_id, f'{requester.name} joined the group')

        # Broadcast to all members
        members_result = await db.execute(
            select(ChatMember).where(
                and_(ChatMember.session_id == session_id, ChatMember.left_at == None)
            )
        )
        member_ids = [m.user_id for m in members_result.scalars().all()]
        await manager.broadcast_to_session(
            member_ids,
            {'type': 'member_joined', 'session_id': session_id, 'user_id': join_request.user_id}
        )

        # Notify the requester
        await manager.broadcast_to_session(
            [join_request.user_id],
            {'type': 'join_approved', 'session_id': session_id}
        )

        return {'status': 'approved'}

    else:  # reject
        join_request.status = 'rejected'
        join_request.resolved_at = dt.utcnow()
        join_request.resolved_by = user_id
        await db.flush()

        # Notify the requester
        await manager.broadcast_to_session(
            [join_request.user_id],
            {'type': 'join_rejected', 'session_id': session_id}
        )

        return {'status': 'rejected'}


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
