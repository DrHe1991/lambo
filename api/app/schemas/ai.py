from pydantic import BaseModel, Field


class ReportVerdict(BaseModel):
    """AI verdict on a user-submitted content report."""
    verdict: str = Field(..., pattern=r'^(valid|invalid|escalate)$')
    confidence: float = Field(..., ge=0.0, le=1.0)
    reason: str


class ContentScore(BaseModel):
    """AI quality assessment of a post."""
    quality_score: int = Field(..., ge=0, le=100)
    tags: list[str] = Field(default_factory=list)


class ModerationResult(BaseModel):
    """AI content safety screening result."""
    safe: bool
    flags: list[str] = Field(default_factory=list)
    severity: str = Field(default='none', pattern=r'^(none|low|high)$')


class BoostTargeting(BaseModel):
    """AI-generated audience targeting for boosted content."""
    relevance_tags: list[str] = Field(default_factory=list)
    audience_keywords: list[str] = Field(default_factory=list)
    suggested_category: str = ''


class ReportCreate(BaseModel):
    """Schema for submitting a content report."""
    post_id: int
    reason: str = Field(..., min_length=5, max_length=1000)


class ReportResponse(BaseModel):
    """Response after submitting a report."""
    id: int
    post_id: int
    reporter_id: int
    reason: str
    verdict: str
    confidence: float
    ai_reason: str
    action_taken: str
    created_at: str

    class Config:
        from_attributes = True
