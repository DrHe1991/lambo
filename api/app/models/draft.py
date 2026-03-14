from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Draft(Base):
    """Draft model for saving unpublished posts."""

    __tablename__ = 'drafts'

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    
    post_type: Mapped[str] = mapped_column(String(20), default='note')
    title: Mapped[str | None] = mapped_column(String(200), default=None)
    content: Mapped[str] = mapped_column(Text, default='')
    bounty: Mapped[int | None] = mapped_column(Integer, default=None)
    has_title: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    author: Mapped['User'] = relationship('User', back_populates='drafts')
