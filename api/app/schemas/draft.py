from datetime import datetime
from pydantic import BaseModel, Field


class DraftCreate(BaseModel):
    """Schema for creating/updating a draft."""
    post_type: str = Field(default='note', pattern=r'^(note|article|question)$')
    title: str | None = Field(None, max_length=200)
    content: str = Field(default='', max_length=50000)
    bounty: int | None = Field(None, ge=0)
    has_title: bool = False


class DraftUpdate(BaseModel):
    """Schema for updating a draft."""
    post_type: str | None = Field(None, pattern=r'^(note|article|question)$')
    title: str | None = Field(None, max_length=200)
    content: str | None = Field(None, max_length=50000)
    bounty: int | None = None
    has_title: bool | None = None


class DraftResponse(BaseModel):
    """Draft response."""
    id: int
    post_type: str
    title: str | None = None
    content: str
    bounty: int | None = None
    has_title: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
