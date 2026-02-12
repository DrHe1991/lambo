from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    """Base user fields."""
    name: str = Field(..., min_length=1, max_length=100)
    handle: str = Field(..., min_length=1, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    bio: str | None = Field(None, max_length=300)


class UserCreate(UserBase):
    """Schema for creating a user."""
    email: EmailStr
    password: str = Field(..., min_length=6)
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

    class Config:
        from_attributes = True


class UserResponse(UserBrief):
    """Full user response."""
    bio: str | None
    created_at: datetime
    followers_count: int = 0
    following_count: int = 0
    is_following: bool = False

    class Config:
        from_attributes = True
