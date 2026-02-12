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


class MessageResponse(BaseModel):
    """Message response."""
    id: int
    session_id: int
    sender_id: int
    sender: UserBrief
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
