"""Chat service with message permission logic."""
from enum import Enum
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, Follow
from app.models.chat import ChatSession, ChatMember, Message


class MessagePermission(str, Enum):
    ALLOWED = 'allowed'  # Can send unlimited messages
    ONE_MESSAGE = 'one_message'  # Can send 1 message (cold outreach)
    WAITING = 'waiting'  # Already sent 1 msg, waiting for reply
    FOLLOW_REQUIRED = 'follow_required'  # Must follow to message


class ChatService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def check_follow(self, follower_id: int, following_id: int) -> bool:
        """Check if follower_id follows following_id."""
        result = await self.db.execute(
            select(Follow).where(
                and_(Follow.follower_id == follower_id, Follow.following_id == following_id)
            )
        )
        return result.scalar_one_or_none() is not None

    async def get_dm_session(self, user1_id: int, user2_id: int) -> ChatSession | None:
        """Find existing DM session between two users."""
        # Find sessions where both are members and it's not a group
        result = await self.db.execute(
            select(ChatSession)
            .join(ChatMember)
            .where(
                and_(
                    ChatSession.is_group == False,
                    ChatMember.user_id.in_([user1_id, user2_id])
                )
            )
            .group_by(ChatSession.id)
            .having(func.count(ChatMember.user_id.distinct()) == 2)
        )
        return result.scalar_one_or_none()

    async def has_recipient_replied(self, session_id: int, initiator_id: int) -> bool:
        """Check if the other person has sent any message in this session."""
        result = await self.db.execute(
            select(func.count()).where(
                and_(
                    Message.session_id == session_id,
                    Message.sender_id != initiator_id
                )
            )
        )
        count = result.scalar_one()
        return count > 0

    async def initiator_message_count(self, session_id: int, initiator_id: int) -> int:
        """Count messages sent by initiator before recipient replied."""
        result = await self.db.execute(
            select(func.count()).where(
                and_(
                    Message.session_id == session_id,
                    Message.sender_id == initiator_id
                )
            )
        )
        return result.scalar_one()

    async def get_message_permission(
        self, sender_id: int, recipient_id: int
    ) -> tuple[MessagePermission, str]:
        """
        Determine if sender can message recipient.
        
        Rules:
        1. Mutual follow → unlimited
        2. Recipient follows sender → unlimited
        3. Conversation started (recipient replied) → unlimited
        4. No prior message → 1 message allowed (cold outreach)
        5. Already sent 1 msg and no reply → waiting
        """
        recipient_follows_sender = await self.check_follow(recipient_id, sender_id)

        # Recipient follows sender → unlimited
        if recipient_follows_sender:
            return MessagePermission.ALLOWED, 'They follow you'

        # Check existing conversation
        session = await self.get_dm_session(sender_id, recipient_id)
        
        if not session:
            # No session yet - can send 1 message to start (cold outreach)
            return MessagePermission.ONE_MESSAGE, 'You can send 1 message'

        # Session exists - check if recipient has replied
        if session.initiated_by == sender_id:
            # Sender initiated - check if recipient replied
            if await self.has_recipient_replied(session.id, sender_id):
                return MessagePermission.ALLOWED, 'Conversation started'
            
            # Check if sender already sent a message
            msg_count = await self.initiator_message_count(session.id, sender_id)
            if msg_count > 0:
                return MessagePermission.WAITING, 'Waiting for reply'
            else:
                return MessagePermission.ONE_MESSAGE, 'You can send 1 message'
        else:
            # Recipient initiated - sender can reply freely
            return MessagePermission.ALLOWED, 'They messaged you first'

    async def can_send_message(self, sender_id: int, session_id: int) -> tuple[bool, str]:
        """Check if sender can send a message to this session."""
        # Get session and members
        session = await self.db.get(ChatSession, session_id)
        if not session:
            return False, 'Session not found'

        # Group chats - always allowed for members
        if session.is_group:
            return True, 'Group chat'

        # Get the other member
        members_result = await self.db.execute(
            select(ChatMember).where(ChatMember.session_id == session_id)
        )
        members = members_result.scalars().all()
        other_member = next((m for m in members if m.user_id != sender_id), None)
        
        if not other_member:
            return False, 'Invalid session'

        recipient_id = other_member.user_id
        permission, reason = await self.get_message_permission(sender_id, recipient_id)

        if permission == MessagePermission.ALLOWED:
            return True, reason
        elif permission == MessagePermission.ONE_MESSAGE:
            return True, reason
        elif permission == MessagePermission.WAITING:
            return False, 'Waiting for reply before you can send more messages'
        else:  # FOLLOW_REQUIRED
            return False, 'Follow this user to message'
