"""
Settlement API - Background task endpoint for settling expired pending likes.

This endpoint should be called by a cron job (e.g., every minute) to settle
all expired pending likes (both post and comment) in the correct order.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.dynamic_like_service import DynamicLikeService

router = APIRouter()


@router.post('/settle-likes')
async def settle_pending_likes(
    batch_size: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Settle all expired pending likes (posts and comments).
    
    Called by cron job every minute. Processes in batches to avoid overload.
    Settles in created_at order to ensure fair revenue distribution.
    """
    service = DynamicLikeService(db)
    
    # Settle post likes
    post_settled = await service.settle_expired_likes(post_id=None)
    
    # Settle comment likes
    comment_settled = await service.settle_expired_comment_likes(comment_id=None)
    
    await db.commit()
    
    total_settled = len(post_settled) + len(comment_settled)
    
    return {
        'post_likes_settled': len(post_settled),
        'comment_likes_settled': len(comment_settled),
        'total_settled': total_settled,
        'post_details': post_settled[:5] if len(post_settled) > 5 else post_settled,
        'comment_details': comment_settled[:5] if len(comment_settled) > 5 else comment_settled,
    }


@router.get('/pending-likes-count')
async def get_pending_likes_count(
    db: AsyncSession = Depends(get_db),
):
    """Get count of pending likes that need settlement (for monitoring)."""
    from datetime import datetime
    from sqlalchemy import select, func
    from app.models.post import PostLike, CommentLike, InteractionStatus
    
    # Post likes
    post_result = await db.execute(
        select(func.count(PostLike.id)).where(
            PostLike.status == InteractionStatus.PENDING.value,
            PostLike.locked_until < datetime.utcnow()
        )
    )
    post_expired = post_result.scalar() or 0
    
    post_pending_result = await db.execute(
        select(func.count(PostLike.id)).where(
            PostLike.status == InteractionStatus.PENDING.value
        )
    )
    post_total_pending = post_pending_result.scalar() or 0
    
    # Comment likes
    comment_result = await db.execute(
        select(func.count(CommentLike.id)).where(
            CommentLike.status == InteractionStatus.PENDING.value,
            CommentLike.locked_until < datetime.utcnow()
        )
    )
    comment_expired = comment_result.scalar() or 0
    
    comment_pending_result = await db.execute(
        select(func.count(CommentLike.id)).where(
            CommentLike.status == InteractionStatus.PENDING.value
        )
    )
    comment_total_pending = comment_pending_result.scalar() or 0
    
    return {
        'post_likes': {
            'expired_pending': post_expired,
            'total_pending': post_total_pending,
        },
        'comment_likes': {
            'expired_pending': comment_expired,
            'total_pending': comment_total_pending,
        },
        'total_expired': post_expired + comment_expired,
        'total_pending': post_total_pending + comment_total_pending,
    }
