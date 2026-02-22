from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.user import UserBrief


class ChatSessionCreate(BaseModel):
    """Schema for creating a chat session."""
    member_ids: list[int] = Field(..., min_length=1)
    name: str | None = Field(None, max_length=100)
    is_group: bool = False


class ChatSessionResponse(BaseModel):
    """Chat session response."""
    id: int
    name: str | None
    is_group: bool
    members: list[UserBrief]
    last_message: str | None = None
    last_message_at: datetime | None = None
    unread_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    """Schema for creating a message."""
    content: str = Field(..., min_length=1, max_length=5000)
    reply_to_id: int | None = None


class ReplyInfo(BaseModel):
    """Brief info about the message being replied to."""
    id: int
    content: str
    sender_id: int
    sender_name: str


class ReactionInfo(BaseModel):
    """Reaction info with user details."""
    emoji: str
    user_id: int
    user_name: str


class MessageResponse(BaseModel):
    """Message response."""
    id: int
    session_id: int
    sender_id: int
    sender: UserBrief
    content: str
    message_type: str = 'text'  # 'text' or 'system'
    status: str = 'sent'  # 'sent' or 'pending'
    reply_to: ReplyInfo | None = None
    reactions: list[ReactionInfo] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ReactionCreate(BaseModel):
    """Schema for adding a reaction."""
    emoji: str = Field(..., min_length=1, max_length=10)


class ReactionResponse(BaseModel):
    """Reaction response."""
    id: int
    message_id: int
    user_id: int
    emoji: str
    created_at: datetime

    class Config:
        from_attributes = True
