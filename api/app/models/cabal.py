"""Cabal detection models - tracks suspected coordinated manipulation groups."""
from datetime import datetime
from enum import Enum
from sqlalchemy import String, Integer, BigInteger, ForeignKey, DateTime, Float, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class CabalStatus(str, Enum):
    """Status of a detected cabal group."""
    SUSPECTED = 'suspected'     # Under investigation
    CONFIRMED = 'confirmed'     # Confirmed cabal, penalties applied
    CLEARED = 'cleared'         # False positive, cleared
    DISBANDED = 'disbanded'     # Members left/inactive


class CabalGroup(Base):
    """A detected cabal (coordinated manipulation group)."""

    __tablename__ = 'cabal_groups'

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default=CabalStatus.SUSPECTED.value)
    
    # Detection metrics
    internal_ratio: Mapped[float] = mapped_column(Float, default=0.0)  # internal/external interactions
    avg_internal_interactions: Mapped[float] = mapped_column(Float, default=0.0)
    member_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Penalty tracking
    total_confiscated: Mapped[int] = mapped_column(BigInteger, default=0)
    penalty_expires_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    
    # Notes
    detection_notes: Mapped[str | None] = mapped_column(Text, default=None)
    
    # Timestamps
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    
    # Relationships
    members: Mapped[list['CabalMember']] = relationship('CabalMember', back_populates='group')


class CabalMember(Base):
    """A member of a detected cabal group."""

    __tablename__ = 'cabal_members'

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey('cabal_groups.id', ondelete='CASCADE'))
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    
    # Role in the cabal
    is_leader: Mapped[bool] = mapped_column(Boolean, default=False)  # Leaders get harsher penalties
    
    # Contribution to cabal detection
    internal_interactions: Mapped[int] = mapped_column(Integer, default=0)
    external_interactions: Mapped[int] = mapped_column(Integer, default=0)
    
    # Penalties applied
    risk_added: Mapped[int] = mapped_column(Integer, default=0)
    creator_deducted: Mapped[int] = mapped_column(Integer, default=0)
    balance_confiscated: Mapped[int] = mapped_column(BigInteger, default=0)
    
    # Timestamps
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    penalized_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    
    # Relationships
    group: Mapped['CabalGroup'] = relationship('CabalGroup', back_populates='members')
