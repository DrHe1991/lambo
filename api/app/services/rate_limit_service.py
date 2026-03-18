"""
Rate Limit Service - Prevents spam and abuse.

Limits:
- Posts: 3/hour, 10/day
- Comments: 3/minute, 20/hour
"""
from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.post import Post, Comment


RATE_LIMITS = {
    'post': {
        'per_hour': 3,
        'per_day': 10,
    },
    'comment': {
        'per_minute': 3,
        'per_hour': 20,
    },
}


class RateLimitExceeded(Exception):
    """Raised when user exceeds rate limit."""
    def __init__(self, message: str, retry_after: int = 60):
        self.message = message
        self.retry_after = retry_after
        super().__init__(message)


async def check_post_rate_limit(db: AsyncSession, user_id: int) -> tuple[bool, str | None]:
    """Check if user can create a new post.
    
    Returns (allowed, error_message).
    """
    limits = RATE_LIMITS['post']
    now = datetime.utcnow()
    
    # Check hourly limit
    hour_ago = now - timedelta(hours=1)
    hour_result = await db.execute(
        select(func.count(Post.id)).where(
            Post.author_id == user_id,
            Post.created_at > hour_ago
        )
    )
    hour_count = hour_result.scalar() or 0
    
    if hour_count >= limits['per_hour']:
        return False, f'Rate limit: max {limits["per_hour"]} posts per hour'
    
    # Check daily limit
    day_ago = now - timedelta(days=1)
    day_result = await db.execute(
        select(func.count(Post.id)).where(
            Post.author_id == user_id,
            Post.created_at > day_ago
        )
    )
    day_count = day_result.scalar() or 0
    
    if day_count >= limits['per_day']:
        return False, f'Rate limit: max {limits["per_day"]} posts per day'
    
    return True, None


async def check_comment_rate_limit(db: AsyncSession, user_id: int) -> tuple[bool, str | None]:
    """Check if user can create a new comment.
    
    Returns (allowed, error_message).
    """
    limits = RATE_LIMITS['comment']
    now = datetime.utcnow()
    
    # Check per-minute limit
    minute_ago = now - timedelta(minutes=1)
    minute_result = await db.execute(
        select(func.count(Comment.id)).where(
            Comment.author_id == user_id,
            Comment.created_at > minute_ago
        )
    )
    minute_count = minute_result.scalar() or 0
    
    if minute_count >= limits['per_minute']:
        return False, f'Rate limit: max {limits["per_minute"]} comments per minute'
    
    # Check hourly limit
    hour_ago = now - timedelta(hours=1)
    hour_result = await db.execute(
        select(func.count(Comment.id)).where(
            Comment.author_id == user_id,
            Comment.created_at > hour_ago
        )
    )
    hour_count = hour_result.scalar() or 0
    
    if hour_count >= limits['per_hour']:
        return False, f'Rate limit: max {limits["per_hour"]} comments per hour'
    
    return True, None
