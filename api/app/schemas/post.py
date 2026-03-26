from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.user import UserBrief


class PostBase(BaseModel):
    """Base post fields."""
    content: str = Field(..., min_length=1, max_length=50000)
    post_type: str = Field(default='note', pattern=r'^(note|article|question)$')


class PostCreate(PostBase):
    """Schema for creating a post."""
    title: str | None = Field(None, max_length=200)
    content_format: str = Field(default='plain', pattern=r'^(plain|markdown)$')
    bounty: int | None = Field(None, ge=0)
    media_urls: list[str] = Field(default_factory=list, max_length=9)


class PostUpdate(BaseModel):
    """Schema for updating a post."""
    content: str | None = Field(None, min_length=1, max_length=5000)


class PostResponse(BaseModel):
    """Post response with author info."""
    id: int
    author: UserBrief
    title: str | None = None
    content: str
    content_format: str = 'plain'
    post_type: str
    status: str
    likes_count: int
    comments_count: int
    bounty: int | None
    cost_paid: int = 0
    media_urls: list[str] = []
    is_ai: bool
    created_at: datetime
    is_liked: bool = False
    like_status: str | None = None
    locked_until: str | None = None

    class Config:
        from_attributes = True


class CommentBase(BaseModel):
    """Base comment fields."""
    content: str = Field(..., min_length=1, max_length=2000)


class CommentCreate(CommentBase):
    """Schema for creating a comment."""
    parent_id: int | None = None


class CommentResponse(BaseModel):
    """Comment response."""
    id: int
    post_id: int
    author: UserBrief
    content: str
    parent_id: int | None
    likes_count: int
    cost_paid: int = 0
    is_liked: bool = False
    like_status: str | None = None
    like_locked_until: str | None = None
    created_at: datetime
    interaction_status: str = 'settled'
    locked_until: datetime | None = None

    class Config:
        from_attributes = True
