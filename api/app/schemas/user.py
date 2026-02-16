from datetime import datetime
from pydantic import BaseModel, Field


class UserBase(BaseModel):
    """Base user fields."""
    name: str = Field(..., min_length=1, max_length=100)
    handle: str = Field(..., min_length=1, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    bio: str | None = Field(None, max_length=300)


class UserCreate(UserBase):
    """Schema for creating a user (no password - dev mode)."""
    avatar: str | None = None


class UserUpdate(BaseModel):
    """Schema for updating a user."""
    name: str | None = Field(None, min_length=1, max_length=100)
    bio: str | None = Field(None, max_length=300)
    avatar: str | None = None


class UserBrief(BaseModel):
    """Brief user info for embedding in responses."""
    id: int
    name: str
    handle: str
    avatar: str | None
    trust_score: int
    available_balance: int = 0
    free_posts_remaining: int = 1

    class Config:
        from_attributes = True


class UserResponse(UserBrief):
    """Full user response."""
    bio: str | None
    created_at: datetime
    available_balance: int = 0
    followers_count: int = 0
    following_count: int = 0
    is_following: bool = False
    # Trust sub-scores
    creator_score: int = 500
    curator_score: int = 500
    juror_score: int = 500
    risk_score: int = 0

    class Config:
        from_attributes = True
