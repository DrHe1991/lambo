from datetime import datetime

from sqlalchemy import String, Integer, BigInteger, Float, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AIUsage(Base):
    """Tracks every LLM call for cost attribution and monitoring."""

    __tablename__ = 'ai_usage'

    id: Mapped[int] = mapped_column(primary_key=True)
    feature: Mapped[str] = mapped_column(String(50), index=True)
    model: Mapped[str] = mapped_column(String(50))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    ref_type: Mapped[str | None] = mapped_column(String(20), default=None)
    ref_id: Mapped[int | None] = mapped_column(BigInteger, default=None)
    error: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )
