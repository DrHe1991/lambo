from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.user import UserBrief


class PostBase(BaseModel):
    """Base post fields."""
    content: str = Field(..., min_length=1, max_length=5000)
    post_type: str = Field(default='note', pattern=r'^(note|question)$')


class PostCreate(PostBase):
    """Schema for creating a post."""
    bounty: int | None = Field(None, ge=0)


class PostUpdate(BaseModel):
    """Schema for updating a post."""
    content: str | None = Field(None, min_length=1, max_length=5000)


class PostResponse(BaseModel):
    """Post response with author info."""
    id: int
    author: UserBrief
    content: str
    post_type: str
    status: str
    likes_count: int
    comments_count: int
    bounty: int | None
    is_ai: bool
    created_at: datetime
    is_liked: bool = False

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
    created_at: datetime

    class Config:
        from_attributes = True
