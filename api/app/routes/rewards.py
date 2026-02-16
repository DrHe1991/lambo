"""Reward settlement & discovery score endpoints."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.post import Post
from app.models.reward import PostReward, RewardPool, SettlementStatus
from app.services.discovery_service import DiscoveryService

router = APIRouter()


@router.post('/settle')
async def run_settlement(
    days_ago: int = Query(default=7, description='Settle posts older than N days'),
    db: AsyncSession = Depends(get_db),
):
    """Trigger reward settlement for mature posts (T+Nd).

    In production this would be a cron job. For dev/testing we expose it as an endpoint.
    """
    cutoff = datetime.utcnow() - timedelta(days=days_ago)
    svc = DiscoveryService(db)
    result = await svc.settle_mature_posts(before_date=cutoff)
    await db.commit()
    return result


@router.get('/posts/{post_id}/discovery')
async def get_post_discovery(
    post_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get Discovery Score breakdown for a post."""
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    svc = DiscoveryService(db)
    breakdown = await svc.get_post_score_breakdown(post_id)

    # Also include settlement info if settled
    result = await db.execute(
        select(PostReward).where(PostReward.post_id == post_id)
    )
    pr = result.scalar_one_or_none()

    return {
        'post_id': post_id,
        'discovery_score': breakdown['total'],
        'likes': breakdown['likes'],
        'settlement': {
            'status': pr.status if pr else 'unsettled',
            'author_reward': pr.author_reward if pr else 0,
            'comment_pool': pr.comment_pool if pr else 0,
            'settled_at': pr.settled_at.isoformat() if pr and pr.settled_at else None,
        } if pr else None,
    }


@router.get('/users/{user_id}/pending-rewards')
async def get_pending_rewards(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get posts by this user that haven't been settled yet (pending rewards)."""
    cutoff = datetime.utcnow() - timedelta(days=7)

    # Posts < 7 days old → still accumulating
    result = await db.execute(
        select(Post)
        .where(Post.author_id == user_id, Post.created_at > cutoff)
        .order_by(desc(Post.created_at))
    )
    pending_posts = list(result.scalars().all())

    svc = DiscoveryService(db)
    items = []
    for p in pending_posts:
        score = await svc.calculate_post_score(p.id)
        days_left = max(0, 7 - (datetime.utcnow() - p.created_at).days)
        items.append({
            'post_id': p.id,
            'content_preview': p.content[:80],
            'discovery_score': round(score, 4),
            'days_left': days_left,
            'created_at': p.created_at.isoformat(),
        })

    return {'user_id': user_id, 'pending': items}


@router.get('/users/{user_id}/rewards')
async def get_user_rewards(
    user_id: int,
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get settled rewards for posts authored by this user."""
    result = await db.execute(
        select(PostReward, Post)
        .join(Post, PostReward.post_id == Post.id)
        .where(
            Post.author_id == user_id,
            PostReward.status == SettlementStatus.SETTLED.value,
        )
        .order_by(desc(PostReward.settled_at))
        .limit(limit)
    )
    rows = result.all()

    items = []
    for pr, post in rows:
        items.append({
            'post_id': post.id,
            'content_preview': post.content[:80],
            'discovery_score': round(pr.discovery_score, 4),
            'author_reward': pr.author_reward,
            'comment_pool': pr.comment_pool,
            'settled_at': pr.settled_at.isoformat() if pr.settled_at else None,
        })

    total_earned = sum(i['author_reward'] for i in items)
    return {'user_id': user_id, 'total_earned': total_earned, 'rewards': items}


@router.get('/pools')
async def list_pools(
    limit: int = Query(default=10, le=50),
    db: AsyncSession = Depends(get_db),
):
    """List recent reward pools."""
    result = await db.execute(
        select(RewardPool)
        .order_by(desc(RewardPool.created_at))
        .limit(limit)
    )
    pools = result.scalars().all()
    return [
        {
            'id': p.id,
            'settle_date': p.settle_date,
            'total_pool': p.total_pool,
            'total_distributed': p.total_distributed,
            'post_count': p.post_count,
            'status': p.status,
        }
        for p in pools
    ]
