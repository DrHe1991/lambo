"""Posts + Comments + Comment-likes.

Tip-style likes (the monetary action) live in `tips.py`. This module handles
the social side: post CRUD, comment CRUD, comment-likes (free), and the feed.

Auth: `get_current_user` for writes, `get_optional_user` for reads (so the
public feed renders for anonymous viewers too).
"""
from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user, get_optional_user
from app.config import settings
from app.db.database import get_db
from app.models.ledger import ActionType, RefType
from app.models.post import (
    Comment, CommentLike, ContentFormat, Post, PostLike, PostStatus, PostType,
)
from app.models.user import Follow, User
from app.schemas.post import (
    CommentCreate, CommentResponse, PostCreate, PostResponse, PostUpdate,
)
from app.schemas.user import UserBrief
from app.services.ai_service import AIServiceError, ai_service
from app.services.ledger_service import LedgerService
from app.services.rate_limit_service import (
    check_comment_rate_limit, check_post_rate_limit,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Helpers ----------------------------------------------------------------

def _user_brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id,
        name=user.name,
        handle=user.handle,
        avatar=user.avatar,
        embedded_wallet_address=user.embedded_wallet_address,
        trust_score=user.trust_score,
    )


def build_post_response(post: Post, is_liked: bool = False) -> PostResponse:
    return PostResponse(
        id=post.id,
        author=_user_brief(post.author),
        title=post.title,
        content=post.content,
        content_format=post.content_format or 'plain',
        post_type=post.post_type,
        status=post.status,
        likes_count=post.likes_count,
        comments_count=post.comments_count,
        bounty=post.bounty,
        tip_count=post.tip_count,
        tip_total_usdc_micro=post.tip_total_usdc_micro,
        media_urls=post.media_urls or [],
        is_ai=post.is_ai,
        quality=post.quality,
        tags=post.tags,
        ai_summary=post.ai_summary,
        created_at=post.created_at,
        is_liked=is_liked,
    )


def _comment_response(c: Comment, author: User, is_liked: bool = False) -> CommentResponse:
    return CommentResponse(
        id=c.id,
        post_id=c.post_id,
        author=_user_brief(author),
        content=c.content,
        parent_id=c.parent_id,
        likes_count=c.likes_count,
        is_liked=is_liked,
        created_at=c.created_at,
    )


async def _likes_by_user(db: AsyncSession, post_ids: list[int], user_id: int) -> set[int]:
    """Set of post_ids that user has liked (= tipped)."""
    if not post_ids or not user_id:
        return set()
    rows = await db.execute(
        select(PostLike.post_id).where(
            PostLike.user_id == user_id,
            PostLike.post_id.in_(post_ids),
        )
    )
    return {r[0] for r in rows.all()}


async def _comment_likes_by_user(
    db: AsyncSession, comment_ids: list[int], user_id: int,
) -> set[int]:
    if not comment_ids or not user_id:
        return set()
    rows = await db.execute(
        select(CommentLike.comment_id).where(
            CommentLike.user_id == user_id,
            CommentLike.comment_id.in_(comment_ids),
        )
    )
    return {r[0] for r in rows.all()}


# --- Posts ------------------------------------------------------------------

@router.post('', response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_post(
    post_data: PostCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a post. Limited by `free_posts_remaining` (resets daily, non-monetary)."""
    allowed, error_msg = await check_post_rate_limit(db, current_user.id)
    if not allowed:
        raise HTTPException(status_code=429, detail=error_msg)

    today = date.today()
    if current_user.free_posts_reset_date is None or current_user.free_posts_reset_date < today:
        current_user.free_posts_remaining = settings.free_posts_per_day
        current_user.free_posts_reset_date = today

    if current_user.free_posts_remaining <= 0:
        raise HTTPException(
            status_code=429,
            detail=f'Daily post limit reached ({settings.free_posts_per_day}/day). Try again tomorrow.',
        )

    current_user.free_posts_remaining -= 1

    is_article = post_data.post_type == PostType.ARTICLE.value
    if is_article and not post_data.title:
        raise HTTPException(status_code=400, detail='Articles require a title')
    content_format = post_data.content_format if is_article else ContentFormat.PLAIN.value

    post = Post(
        author_id=current_user.id,
        title=post_data.title if is_article else None,
        content=post_data.content,
        content_format=content_format,
        post_type=post_data.post_type,
        bounty=post_data.bounty,
        media_urls=post_data.media_urls,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post, ['author'])

    ledger = LedgerService(db)
    await ledger.record(
        user_id=current_user.id,
        amount_usdc_micro=0,
        action_type=ActionType.FREE_POST_USED,
        ref_type=RefType.POST,
        ref_id=post.id,
        note=f'free post {settings.free_posts_per_day - current_user.free_posts_remaining}/{settings.free_posts_per_day}',
    )

    if settings.ai_enabled and ai_service.api_key:
        try:
            result = await ai_service.evaluate_post(
                post.content, title=post.title, post_type=post.post_type,
                db=db, ref_id=post.id,
            )
            post.quality = result.quality
            post.tags = result.tags
            if result.summary:
                post.ai_summary = result.summary
            if result.severity == 'high':
                post.status = PostStatus.CHALLENGED.value
                logger.info('Post %d auto-moderated: %s', post.id, result.flags)
            await db.flush()
        except AIServiceError as e:
            if 'content_policy_violation' in str(getattr(e, 'message', e)):
                post.status = PostStatus.CHALLENGED.value
                post.quality = 'low'
                post.ai_summary = 'Blocked by content policy'
                await db.flush()
        except Exception:
            logger.exception('AI screening error for post %d, allowing', post.id)

    await db.commit()
    return build_post_response(post)


class FreePostsResponse(BaseModel):
    free_posts_remaining: int
    daily_quota: int
    message: str


@router.get('/free-quota', response_model=FreePostsResponse)
async def get_free_quota(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Daily free post quota for the current user."""
    today = date.today()
    remaining = current_user.free_posts_remaining
    if current_user.free_posts_reset_date is None or current_user.free_posts_reset_date < today:
        remaining = settings.free_posts_per_day

    msg = (
        f'{remaining} of {settings.free_posts_per_day} free posts left today'
        if remaining > 0
        else 'Daily post limit reached. Resets at midnight UTC.'
    )
    return FreePostsResponse(
        free_posts_remaining=remaining,
        daily_quota=settings.free_posts_per_day,
        message=msg,
    )


@router.get('', response_model=list[PostResponse])
async def get_posts(
    post_type: str | None = Query(None, pattern=r'^(note|article|question)$'),
    author_id: int | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get posts with optional filters."""
    query = (
        select(Post)
        .options(selectinload(Post.author))
        .where(Post.status == PostStatus.ACTIVE.value)
        .order_by(desc(Post.created_at))
    )
    if post_type:
        query = query.where(Post.post_type == post_type)
    if author_id:
        query = query.where(Post.author_id == author_id)

    result = await db.execute(query.limit(limit).offset(offset))
    posts = list(result.scalars().all())
    liked = await _likes_by_user(
        db, [p.id for p in posts], current_user.id if current_user else 0,
    )
    return [build_post_response(p, is_liked=p.id in liked) for p in posts]


# AI quality is a trash filter, not a ranking booster — engagement is the real signal
AI_QUALITY_MULT = {'low': 0.3, 'medium': 1.0, 'good': 1.0, 'great': 1.0}


def _feed_score(
    post: Post,
    following_ids: set[int],
    user_interests: dict[str, int] | None = None,
) -> float:
    """Composite feed score: time_decay * engagement * following * interest * ai_filter + noise."""
    import math
    import random
    import time

    now = time.time()
    age_days = max(0.01, (now - post.created_at.timestamp()) / 86400)

    likes = post.likes_count or 0
    comments = post.comments_count or 0

    half_life = 3.0 + min(4.0, math.log(likes + 1))
    time_decay = math.exp(-age_days * math.log(2) / half_life)

    like_density = likes / max(1.0, age_days)
    engagement = min(1.0, like_density / 5.0)
    comment_ratio = min(1.0, comments / max(1, likes))
    engagement_score = engagement * 0.7 + comment_ratio * 0.3 if likes else 0.3

    q_mult = AI_QUALITY_MULT.get(post.quality or 'medium', 1.0)
    following_mult = 2.5 if post.author_id in following_ids else 1.0

    interest_mult = 1.0
    post_tags = post.tags or []
    if user_interests and post_tags:
        overlap = sum(user_interests.get(t, 0) for t in post_tags)
        interest_mult = 1.0 + min(1.0, overlap / 20.0)

    noise = 1.0 + random.uniform(-0.15, 0.15)
    return time_decay * engagement_score * q_mult * following_mult * interest_mult * noise


@router.get('/feed', response_model=list[PostResponse])
async def get_feed(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Mixed feed: following + global, ranked by composite score. Anonymous viewers get popularity-weighted feed."""
    following_ids: set[int] = set()
    user_interests = None
    if current_user is not None:
        user_interests = current_user.interest_tags
        following_result = await db.execute(
            select(Follow.following_id).where(Follow.follower_id == current_user.id)
        )
        following_ids = {row[0] for row in following_result.all()}

    pool_size = max(limit * 5, 150)
    query = (
        select(Post)
        .options(selectinload(Post.author))
        .where(Post.status == PostStatus.ACTIVE.value)
        .order_by(desc(Post.created_at))
        .limit(pool_size)
    )
    result = await db.execute(query)
    posts = list(result.scalars().all())
    posts.sort(key=lambda p: _feed_score(p, following_ids, user_interests), reverse=True)
    page = posts[offset:offset + limit]

    liked = await _likes_by_user(
        db, [p.id for p in page], current_user.id if current_user else 0,
    )
    return [build_post_response(p, is_liked=p.id in liked) for p in page]


@router.get('/{post_id}', response_model=PostResponse)
async def get_post(
    post_id: int,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single post by ID."""
    result = await db.execute(
        select(Post).options(selectinload(Post.author)).where(Post.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    is_liked = False
    if current_user is not None:
        liked = await _likes_by_user(db, [post.id], current_user.id)
        is_liked = post.id in liked
    return build_post_response(post, is_liked=is_liked)


@router.patch('/{post_id}', response_model=PostResponse)
async def update_post(
    post_id: int,
    post_data: PostUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a post (only by author)."""
    result = await db.execute(
        select(Post).options(selectinload(Post.author)).where(Post.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail='Not authorized')

    update_data = post_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(post, field, value)
    await db.commit()
    await db.refresh(post)
    return build_post_response(post)


@router.delete('/{post_id}', status_code=status.HTTP_200_OK)
async def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a post (author only). On-chain tips already received are NOT refunded."""
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail='Not authorized')
    if post.status == PostStatus.DELETED.value:
        raise HTTPException(status_code=400, detail='Post already deleted')

    post.status = PostStatus.DELETED.value
    await db.commit()
    return {'status': 'deleted'}


# --- Comments ---------------------------------------------------------------

@router.post(
    '/{post_id}/comments', response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    post_id: int,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a comment or reply (free, rate-limited)."""
    post = await db.get(Post, post_id)
    if not post or post.status != PostStatus.ACTIVE.value:
        raise HTTPException(status_code=404, detail='Post not found')

    allowed, error_msg = await check_comment_rate_limit(db, current_user.id)
    if not allowed:
        raise HTTPException(status_code=429, detail=error_msg)

    actual_parent_id = comment_data.parent_id
    if comment_data.parent_id:
        parent_comment = await db.get(Comment, comment_data.parent_id)
        if not parent_comment or parent_comment.post_id != post_id:
            raise HTTPException(status_code=400, detail='Invalid parent comment')
        # Flatten nested replies one level
        if parent_comment.parent_id:
            actual_parent_id = parent_comment.parent_id

    comment = Comment(
        post_id=post_id,
        author_id=current_user.id,
        content=comment_data.content,
        parent_id=actual_parent_id,
    )
    db.add(comment)
    post.comments_count += 1

    await db.commit()
    await db.refresh(comment)
    return _comment_response(comment, current_user)


@router.get('/{post_id}/comments', response_model=list[CommentResponse])
async def get_comments(
    post_id: int,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get comments for a post (excludes deleted)."""
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.author))
        .where(and_(Comment.post_id == post_id, Comment.deleted.is_(False)))
        .order_by(Comment.created_at)
        .limit(limit)
        .offset(offset)
    )
    comments = list(result.scalars().all())
    liked = await _comment_likes_by_user(
        db, [c.id for c in comments], current_user.id if current_user else 0,
    )
    return [
        _comment_response(c, c.author, is_liked=c.id in liked)
        for c in comments
    ]


@router.delete('/comments/{comment_id}', status_code=status.HTTP_200_OK)
async def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a comment (author only)."""
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail='Comment not found')
    if comment.author_id != current_user.id:
        raise HTTPException(status_code=403, detail='Not authorized')
    if comment.deleted:
        raise HTTPException(status_code=400, detail='Comment already deleted')

    post = await db.get(Post, comment.post_id)
    if post:
        post.comments_count = max(0, post.comments_count - 1)
    comment.deleted = True
    comment.content = '[deleted]'
    await db.commit()
    return {'status': 'deleted'}


# --- Comment likes (free signal) -------------------------------------------

@router.post('/{post_id}/comments/{comment_id}/like', status_code=status.HTTP_200_OK)
async def like_comment(
    post_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle like on a comment (free)."""
    comment = await db.get(Comment, comment_id)
    if not comment or comment.post_id != post_id or comment.deleted:
        raise HTTPException(status_code=404, detail='Comment not found')
    if comment.author_id == current_user.id:
        raise HTTPException(status_code=400, detail='Cannot like your own comment')

    existing = await db.execute(
        select(CommentLike).where(
            CommentLike.comment_id == comment_id,
            CommentLike.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return {'is_liked': True, 'likes_count': comment.likes_count}

    db.add(CommentLike(comment_id=comment_id, user_id=current_user.id))
    comment.likes_count += 1
    await db.commit()
    return {'is_liked': True, 'likes_count': comment.likes_count}


@router.delete('/{post_id}/comments/{comment_id}/like', status_code=status.HTTP_200_OK)
async def unlike_comment(
    post_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(Comment, comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail='Comment not found')

    result = await db.execute(
        select(CommentLike).where(
            CommentLike.comment_id == comment_id,
            CommentLike.user_id == current_user.id,
        )
    )
    like = result.scalar_one_or_none()
    if like is None:
        return {'is_liked': False, 'likes_count': comment.likes_count}

    await db.delete(like)
    comment.likes_count = max(0, comment.likes_count - 1)
    await db.commit()
    return {'is_liked': False, 'likes_count': comment.likes_count}
