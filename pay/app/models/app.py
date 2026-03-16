from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class App(Base):
    """Registered client applications that use the payment gateway."""
    __tablename__ = 'pay_apps'

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    api_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    api_secret_hash: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Webhook URL for deposit notifications
    webhook_url: Mapped[str | None] = mapped_column(String(500), default=None)
    webhook_secret: Mapped[str | None] = mapped_column(String(64), default=None)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    wallets: Mapped[list['Wallet']] = relationship(
        'Wallet', back_populates='app', lazy='selectin'
    )
