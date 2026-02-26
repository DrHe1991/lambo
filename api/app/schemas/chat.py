from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.user import UserBrief


class ChatSessionCreate(BaseModel):
    """Schema for creating a chat session."""
    member_ids: list[int] = Field(..., min_length=1)
    name: str | None = Field(None, max_length=100)
    is_group: bool = False
    avatar: str | None = None
    description: str | None = Field(None, max_length=500)


class ChatSessionUpdate(BaseModel):
    """Schema for updating a group chat."""
    name: str | None = Field(None, max_length=100)
    avatar: str | None = None
    description: str | None = Field(None, max_length=500)
    who_can_send: str | None = Field(None, pattern='^(all|admins_only)$')
    who_can_add: str | None = Field(None, pattern='^(all|admins_only)$')
    join_approval: bool | None = None
    member_limit: int | None = Field(None, ge=2, le=1000)


class MemberInfo(BaseModel):
    """Member with role info."""
    user: UserBrief
    role: str
    is_muted: bool = False
    joined_at: datetime

    class Config:
        from_attributes = True


class ChatSessionResponse(BaseModel):
    """Chat session response."""
    id: int
    name: str | None
    is_group: bool
    avatar: str | None = None
    description: str | None = None
    owner_id: int | None = None
    members: list[UserBrief]
    last_message: str | None = None
    last_message_at: datetime | None = None
    unread_count: int = 0
    who_can_send: str = 'all'
    who_can_add: str = 'all'
    join_approval: bool = False
    member_limit: int | None = 500
    created_at: datetime
    user_has_left: bool = False

    class Config:
        from_attributes = True


class GroupDetailResponse(BaseModel):
    """Detailed group info with member list."""
    id: int
    name: str | None
    avatar: str | None = None
    description: str | None = None
    owner_id: int
    members: list[MemberInfo]
    member_count: int
    who_can_send: str = 'all'
    who_can_add: str = 'all'
    join_approval: bool = False
    member_limit: int | None = 500
    my_role: str
    created_at: datetime

    class Config:
        from_attributes = True


class AddMembersRequest(BaseModel):
    """Request to add members to a group."""
    user_ids: list[int] = Field(..., min_length=1)


class UpdateRoleRequest(BaseModel):
    """Request to update a member's role."""
    role: str = Field(..., pattern='^(admin|member)$')


class MuteRequest(BaseModel):
    """Request to mute a member."""
    is_muted: bool
    duration_hours: int | None = Field(None, ge=1, le=8760)


class TransferOwnershipRequest(BaseModel):
    """Request to transfer group ownership."""
    new_owner_id: int


class InviteLinkCreate(BaseModel):
    """Schema for creating an invite link."""
    expires_in_days: int | None = Field(None, ge=1, le=365)
    max_uses: int | None = Field(None, ge=1, le=1000)


class InviteLinkResponse(BaseModel):
    """Invite link response."""
    id: int
    code: str
    expires_at: datetime | None
    max_uses: int | None
    use_count: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class InvitePreviewResponse(BaseModel):
    """Preview of a group from invite link."""
    group_name: str | None
    avatar: str | None
    description: str | None
    member_count: int
    requires_approval: bool


class JoinRequestResponse(BaseModel):
    """Join request response."""
    id: int
    session_id: int
    user: 'UserBrief'
    invite_code: str | None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class JoinRequestAction(BaseModel):
    """Action on a join request."""
    action: str = Field(..., pattern='^(approve|reject)$')


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
