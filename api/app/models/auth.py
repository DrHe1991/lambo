from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, UniqueConstraint, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class UserAuthProvider(Base):
    """Links a user to an external auth provider (Google, Ethereum wallet, etc.)."""

    __tablename__ = 'user_auth_providers'

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    provider: Mapped[str] = mapped_column(String(30))  # google, ethereum, solana, bnb
    provider_id: Mapped[str] = mapped_column(String(500))  # google sub or wallet address
    metadata_: Mapped[dict | None] = mapped_column('metadata_', JSONB, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped['User'] = relationship('User', back_populates='auth_providers')

    __table_args__ = (
        UniqueConstraint('provider', 'provider_id', name='uq_provider_provider_id'),
    )


class RefreshToken(Base):
    """Stores hashed refresh tokens for JWT session management."""

    __tablename__ = 'refresh_tokens'

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    device_hint: Mapped[str | None] = mapped_column(String(200), default=None)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)

    user: Mapped['User'] = relationship('User')
