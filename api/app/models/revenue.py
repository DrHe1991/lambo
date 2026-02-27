from datetime import datetime, date
from sqlalchemy import String, BigInteger, Boolean, DateTime, Date, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class PlatformRevenue(Base):
    """Daily platform revenue tracking. 20% of user spending goes here."""

    __tablename__ = 'platform_revenue'

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True)

    # Revenue by source
    like_revenue: Mapped[int] = mapped_column(BigInteger, default=0)
    comment_revenue: Mapped[int] = mapped_column(BigInteger, default=0)
    post_revenue: Mapped[int] = mapped_column(BigInteger, default=0)
    boost_revenue: Mapped[int] = mapped_column(BigInteger, default=0)

    # Total = sum of all sources
    total: Mapped[int] = mapped_column(BigInteger, default=0)

    # Whether this day's revenue has been distributed as quality subsidy
    distributed: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    distributed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
