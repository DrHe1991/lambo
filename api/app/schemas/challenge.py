from datetime import datetime
from pydantic import BaseModel, Field


class ChallengeCreate(BaseModel):
    """Schema for creating a challenge."""
    content_type: str = Field(..., pattern=r'^(post|comment)$')
    content_id: int
    reason: str = Field(..., pattern=r'^(spam|scam|inappropriate|misinformation|harassment)$')


class ChallengeResponse(BaseModel):
    """Challenge response with verdict details."""
    id: int
    content_type: str
    content_id: int
    challenger_id: int
    author_id: int
    reason: str
    layer: int
    status: str
    fee_paid: int
    fine_amount: int
    ai_verdict: str | None
    ai_reason: str | None
    ai_confidence: float | None
    created_at: datetime
    resolved_at: datetime | None

    class Config:
        from_attributes = True
