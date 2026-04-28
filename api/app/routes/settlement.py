"""
Settlement API - Distributes accumulated liker earnings pools.

Called by cron every 60 seconds. For each post/comment with revenue_pool > 0,
divides the pool equally among settled likers and credits their balances.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.dynamic_like_service import DynamicLikeService

router = APIRouter()


@router.post('/settle-likes')
async def distribute_liker_earnings(
    batch_size: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Distribute accumulated revenue pools to likers.

    Called by cron job every 60 seconds. Processes posts and comments
    with undistributed revenue in their pools.
    """
    service = DynamicLikeService(db)
    result = await service.distribute_pools(batch_size)
    await db.commit()
    return result


@router.get('/pending-likes-count')
async def get_pool_stats(
    db: AsyncSession = Depends(get_db),
):
    """Get stats on undistributed revenue pools (for monitoring)."""
    from sqlalchemy import select, func
    from app.models.post import Post, Comment

    post_result = await db.execute(
        select(
            func.count(Post.id),
            func.coalesce(func.sum(Post.revenue_pool), 0)
        ).where(Post.revenue_pool > 0)
    )
    post_row = post_result.one()

    comment_result = await db.execute(
        select(
            func.count(Comment.id),
            func.coalesce(func.sum(Comment.revenue_pool), 0)
        ).where(Comment.revenue_pool > 0)
    )
    comment_row = comment_result.one()

    return {
        'posts_with_pool': post_row[0],
        'post_pool_total': post_row[1],
        'comments_with_pool': comment_row[0],
        'comment_pool_total': comment_row[1],
        'total_undistributed': post_row[1] + comment_row[1],
    }
