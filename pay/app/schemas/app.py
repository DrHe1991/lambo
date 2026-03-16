from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class AppCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    webhook_url: Optional[str] = None


class AppResponse(BaseModel):
    id: int
    name: str
    api_key: str
    description: Optional[str]
    webhook_url: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AppWithSecret(AppResponse):
    """Response with API secret - only returned on creation."""
    api_secret: str
