from datetime import datetime
from enum import Enum

from sqlalchemy import String, Integer, Float, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ReportStatus(str, Enum):
    PENDING = 'pending'
    VALID = 'valid'
    INVALID = 'invalid'
    ESCALATED = 'escalated'


class Report(Base):
    """User-submitted content report, judged by AI."""

    __tablename__ = 'reports'

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey('posts.id', ondelete='CASCADE'), index=True
    )
    reporter_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'), index=True
    )
    reason: Mapped[str] = mapped_column(Text)
    verdict: Mapped[str] = mapped_column(
        String(20), default=ReportStatus.PENDING.value
    )
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    ai_reason: Mapped[str] = mapped_column(Text, default='')
    action_taken: Mapped[str] = mapped_column(String(50), default='none')
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    post: Mapped['Post'] = relationship('Post')
    reporter: Mapped['User'] = relationship('User')
