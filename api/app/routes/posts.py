from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, desc, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.user import User
from app.models.post import (
    Post, Comment, PostStatus, PostType, ContentFormat, PostLike, CommentLike, InteractionStatus,
)
from app.models.ledger import ActionType, RefType, Ledger
from app.schemas.post import (
    PostCreate, PostUpdate, PostResponse, CommentCreate, CommentResponse,
)
from app.schemas.user import UserBrief
from app.services.ledger_service import LedgerService
from app.services.dynamic_like_service import (
    DynamicLikeService, like_cost as calc_like_cost,
    AlreadyLiked, CannotLikeOwnPost, CannotUnlikeSettled,
    InsufficientBalance as DynamicInsufficientBalance,
)
from app.services.rate_limit_service import (
    check_post_rate_limit, check_comment_rate_limit,
)
from app.models.reward import InteractionLog, InteractionType

router = APIRouter()


async def _log_interaction(
    db: AsyncSession, actor_id: int, target_user_id: int,
    itype: InteractionType, ref_id: int | None = None,
):
    """Record an interaction between two users (for N_novelty)."""
    if actor_id == target_user_id:
        return
    db.add(InteractionLog(
        actor_id=actor_id,
        target_user_id=target_user_id,
        interaction_type=itype.value,
        ref_id=ref_id,
    ))


def _user_brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id,
        name=user.name,
        handle=user.handle,
        avatar=user.avatar,
        trust_score=user.trust_score,
        available_balance=user.available_balance,
        free_posts_remaining=user.free_posts_remaining,
    )


def build_post_response(
    post: Post,
    like_info: dict | None = None,
) -> PostResponse:
    """Build PostResponse from Post model with optional like info."""
    is_liked = like_info is not None
    like_status = like_info.get('status') if like_info else None
    locked_until = like_info.get('locked_until') if like_info else None
    
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
        cost_paid=post.cost_paid,
        media_urls=post.media_urls or [],
        is_ai=post.is_ai,
        created_at=post.created_at,
        is_liked=is_liked,
        like_status=like_status,
        locked_until=locked_until,
    )


def _comment_response(c: Comment, author: User, like_info: dict | None = None) -> CommentResponse:
    is_liked = like_info is not None
    like_status = like_info.get('status') if like_info else None
    like_locked_until = like_info.get('locked_until') if like_info else None
    
    return CommentResponse(
        id=c.id,
        post_id=c.post_id,
        author=_user_brief(author),
        content=c.content,
        parent_id=c.parent_id,
        likes_count=c.likes_count,
        cost_paid=c.cost_paid,
        is_liked=is_liked,
        like_status=like_status,
        like_locked_until=like_locked_until,
        created_at=c.created_at,
        interaction_status=c.interaction_status,
        locked_until=c.locked_until,
    )


async def _check_post_liked(db: AsyncSession, post_ids: list[int], user_id: int) -> dict[int, dict]:
    """Return dict mapping post_id to like info {status, locked_until}.
    
    Only returns non-cancelled likes. Settlement is handled by background cron job.
    """
    if not post_ids or not user_id:
        return {}
    
    result = await db.execute(
        select(PostLike)
        .where(PostLike.user_id == user_id)
        .where(PostLike.post_id.in_(post_ids))
        .where(PostLike.status != InteractionStatus.CANCELLED.value)
    )
    likes = list(result.scalars().all())
    
    return {
        like.post_id: {
            'status': like.status,
            'locked_until': like.locked_until.isoformat() if like.locked_until else None,
        }
        for like in likes
    }


async def _check_comment_liked(db: AsyncSession, comment_ids: list[int], user_id: int) -> dict[int, dict]:
    """Return dict mapping comment_id to like info {status, locked_until}.
    
    Only returns non-cancelled likes.
    """
    if not comment_ids or not user_id:
        return {}
    
    result = await db.execute(
        select(CommentLike)
        .where(CommentLike.user_id == user_id)
        .where(CommentLike.comment_id.in_(comment_ids))
        .where(CommentLike.status != InteractionStatus.CANCELLED.value)
    )
    likes = list(result.scalars().all())
    
    return {
        like.comment_id: {
            'status': like.status,
            'locked_until': like.locked_until.isoformat() if like.locked_until else None,
        }
        for like in likes
    }


# ── Posts ────────────────────────────────────────────────────────────────────

@router.post('', response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_post(
    post_data: PostCreate,
    author_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a new post. Free but rate-limited (3/hour, 10/day)."""
    author = await db.get(User, author_id)
    if not author:
        raise HTTPException(status_code=404, detail='Author not found')

    # Check rate limit
    allowed, error_msg = await check_post_rate_limit(db, author_id)
    if not allowed:
        raise HTTPException(status_code=429, detail=error_msg)

    # Articles require a title
    is_article = post_data.post_type == PostType.ARTICLE.value
    if is_article and not post_data.title:
        raise HTTPException(status_code=400, detail='Articles require a title')

    # Determine content format
    content_format = post_data.content_format if is_article else ContentFormat.PLAIN.value

    # In minimal system, posting is free
    post = Post(
        author_id=author_id,
        title=post_data.title if is_article else None,
        content=post_data.content,
        content_format=content_format,
        post_type=post_data.post_type,
        bounty=post_data.bounty,
        media_urls=post_data.media_urls,
        cost_paid=0,  # Free in minimal system
    )
    db.add(post)
    await db.flush()
    await db.refresh(post, ['author'])
    return build_post_response(post)


from pydantic import BaseModel


class CostEstimateResponse(BaseModel):
    """Response with cost breakdown - simplified for minimal system."""
    post_cost: int = 0
    message: str = 'Posting is free in minimal system'


@router.post('/estimate-cost', response_model=CostEstimateResponse)
async def estimate_post_cost(
    author_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Estimate cost for a post - always free in minimal system."""
    return CostEstimateResponse()


@router.get('', response_model=list[PostResponse])
async def get_posts(
    post_type: str | None = Query(None, pattern=r'^(note|article|question)$'),
    author_id: int | None = Query(None),
    user_id: int | None = Query(None, description='Current user for is_liked'),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
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

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    posts = list(result.scalars().all())

    like_info_map = await _check_post_liked(db, [p.id for p in posts], user_id or 0)
    return [build_post_response(p, like_info=like_info_map.get(p.id)) for p in posts]


def _feed_score(post: Post, following_ids: set[int]) -> float:
    """Composite feed score aligned with simulator exposure_weight.

    score = time_decay * quality_signal * author_trust_mult * boost_mult * following_mult
    """
    import math, time

    now = time.time()
    age_days = max(0.01, (now - post.created_at.timestamp()) / 86400)

    likes = post.likes_count or 0
    comments = post.comments_count or 0

    # 1. Time decay – exponential with dynamic half-life (base 3d, +engagement bonus)
    half_life = 3.0 + min(4.0, math.log(likes + 1))
    time_decay = math.exp(-age_days * math.log(2) / half_life)

    # 2. Quality signal – engagement density + comment ratio
    like_density = likes / max(1.0, age_days)
    engagement = min(1.0, like_density / 5.0)
    comment_ratio = min(1.0, comments / max(1, likes))
    quality = engagement * 0.7 + comment_ratio * 0.3 if likes else 0.3

    # 3. Following multiplier (followed authors get priority)
    following_mult = 2.5 if post.author_id in following_ids else 1.0

    # Simplified: no boost, no trust multiplier
    return time_decay * quality * following_mult


@router.get('/feed', response_model=list[PostResponse])
async def get_feed(
    user_id: int = Query(...),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Mixed feed: following posts + global posts, ranked by composite score."""
    from app.models.user import Follow

    following_result = await db.execute(
        select(Follow.following_id).where(Follow.follower_id == user_id)
    )
    following_ids = set(row[0] for row in following_result.all())

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

    posts.sort(key=lambda p: _feed_score(p, following_ids), reverse=True)
    page = posts[offset:offset + limit]

    like_info_map = await _check_post_liked(db, [p.id for p in page], user_id)
    return [build_post_response(p, like_info=like_info_map.get(p.id)) for p in page]


@router.get('/{post_id}', response_model=PostResponse)
async def get_post(
    post_id: int,
    user_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get a single post by ID."""
    result = await db.execute(
        select(Post).options(selectinload(Post.author)).where(Post.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    like_info_map = await _check_post_liked(db, [post.id], user_id or 0)
    return build_post_response(post, like_info=like_info_map.get(post.id))


@router.patch('/{post_id}', response_model=PostResponse)
async def update_post(
    post_id: int,
    post_data: PostUpdate,
    author_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Update a post (only by author)."""
    result = await db.execute(
        select(Post).options(selectinload(Post.author)).where(Post.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    if post.author_id != author_id:
        raise HTTPException(status_code=403, detail='Not authorized')

    update_data = post_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(post, field, value)

    await db.flush()
    await db.refresh(post)
    return build_post_response(post)


@router.delete('/{post_id}', status_code=status.HTTP_200_OK)
async def delete_post(
    post_id: int,
    author_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete a post (only by author)."""
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    if post.author_id != author_id:
        raise HTTPException(status_code=403, detail='Not authorized')

    post.status = PostStatus.DELETED.value
    return {'status': 'deleted'}


# ── Post Likes (Dynamic Pricing + Early Supporter Revenue Sharing) ────────────

@router.get('/{post_id}/like-cost')
async def get_like_cost(
    post_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get current like cost for a post (dynamic pricing)."""
    service = DynamicLikeService(db)
    try:
        cost = await service.get_like_cost(post_id)
        post = await db.get(Post, post_id)
        return {
            'post_id': post_id,
            'cost': cost,
            'likes_count': post.likes_count if post else 0,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post('/{post_id}/like', status_code=status.HTTP_200_OK)
async def like_post(
    post_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Like a post with 1h lock period.
    
    - Sats are locked for 1 hour before settlement
    - User can unlike within 1h for 90% refund
    - After 1h, like is settled and revenue is distributed
    """
    service = DynamicLikeService(db)
    
    try:
        result = await service.like_post(user_id, post_id)
        await db.commit()
        
        post = await db.get(Post, post_id)
        return {
            'likes_count': post.likes_count if post else 0,
            'is_liked': True,
            'like_status': result['status'],
            'locked_until': result['locked_until'].isoformat(),
            'cost': result['cost'],
            'your_weight': result['weight'],
            'like_rank': result['like_rank'],
        }
    except CannotLikeOwnPost:
        raise HTTPException(status_code=400, detail='Cannot like your own post')
    except AlreadyLiked:
        post = await db.get(Post, post_id)
        like_info = await service.get_like_status(user_id, post_id)
        return {
            'likes_count': post.likes_count if post else 0,
            'is_liked': True,
            'like_status': like_info['status'] if like_info else None,
            'locked_until': like_info['locked_until'] if like_info else None,
        }
    except DynamicInsufficientBalance as e:
        raise HTTPException(status_code=402, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete('/{post_id}/like', status_code=status.HTTP_200_OK)
async def unlike_post(
    post_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Unlike a post within the 1h lock period.
    
    - PENDING like: 90% refund, 10% to platform
    - SETTLED like: Cannot unlike (returns error)
    """
    service = DynamicLikeService(db)
    
    try:
        result = await service.unlike_post(user_id, post_id)
        await db.commit()
        
        post = await db.get(Post, post_id)
        
        if not result.get('success'):
            raise HTTPException(status_code=404, detail=result.get('error', 'Like not found'))
        
        return {
            'likes_count': post.likes_count if post else 0,
            'is_liked': False,
            'refund_amount': result.get('refund_amount', 0),
            'refund_rate': '90%',
        }
    except CannotUnlikeSettled:
        raise HTTPException(
            status_code=400,
            detail='Cannot unlike after 1h - like has been settled',
        )


@router.get('/{post_id}/likers')
async def get_post_likers(
    post_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get list of early supporters for a post."""
    service = DynamicLikeService(db)
    try:
        likers = await service.get_post_likers(post_id)
        return {'likers': likers}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Comments ─────────────────────────────────────────────────────────────────

COMMENT_COST_TOP_LEVEL = 5  # Commenting on post: 5 sats to post author
COMMENT_COST_REPLY = 1      # Replying to comment: 1 sat to parent comment author


@router.post(
    '/{post_id}/comments', response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    post_id: int,
    comment_data: CommentCreate,
    author_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a comment or reply. Costs 5 sats (comment) or 1 sat (reply).
    
    Rate limited: 3/minute, 20/hour.
    """
    post = await db.get(Post, post_id)
    if not post or post.status != PostStatus.ACTIVE.value:
        raise HTTPException(status_code=404, detail='Post not found')

    author = await db.get(User, author_id)
    if not author:
        raise HTTPException(status_code=404, detail='Author not found')

    # Check rate limit
    allowed, error_msg = await check_comment_rate_limit(db, author_id)
    if not allowed:
        raise HTTPException(status_code=429, detail=error_msg)

    # Validate parent comment and flatten nested replies
    actual_parent_id = comment_data.parent_id
    parent_comment = None
    if comment_data.parent_id:
        parent_comment = await db.get(Comment, comment_data.parent_id)
        if not parent_comment or parent_comment.post_id != post_id:
            raise HTTPException(status_code=400, detail='Invalid parent comment')
        # If replying to a reply, flatten to same level (use the top-level comment as parent)
        if parent_comment.parent_id:
            actual_parent_id = parent_comment.parent_id
            # Get the actual parent for payment
            parent_comment = await db.get(Comment, actual_parent_id)

    # Determine cost and recipient
    if actual_parent_id and parent_comment:
        # Reply to comment: 1 sat to parent comment author
        cost = COMMENT_COST_REPLY
        recipient_id = parent_comment.author_id
        action_type = ActionType.SPEND_REPLY
    else:
        # Top-level comment: 5 sats to post author
        cost = COMMENT_COST_TOP_LEVEL
        recipient_id = post.author_id
        action_type = ActionType.SPEND_COMMENT

    # Check balance
    if author.available_balance < cost:
        raise HTTPException(
            status_code=402,
            detail=f'Insufficient balance. Need {cost} sat, have {author.available_balance}'
        )

    # Deduct from commenter
    author.available_balance -= cost
    
    # Create spend ledger entry
    spend_entry = Ledger(
        user_id=author_id,
        amount=-cost,
        balance_after=author.available_balance,
        action_type=action_type.value,
        ref_type=RefType.POST.value if not actual_parent_id else RefType.COMMENT.value,
        ref_id=post_id if not actual_parent_id else actual_parent_id,
        note=f'comment on post {post_id}' if not actual_parent_id else f'reply to comment {actual_parent_id}',
    )
    db.add(spend_entry)

    # Pay recipient (instant settlement, no lock)
    recipient = await db.get(User, recipient_id)
    if recipient:
        recipient.available_balance += cost
        earn_entry = Ledger(
            user_id=recipient_id,
            amount=cost,
            balance_after=recipient.available_balance,
            action_type=ActionType.EARN_COMMENT.value,
            ref_type=RefType.POST.value if not actual_parent_id else RefType.COMMENT.value,
            ref_id=post_id if not actual_parent_id else actual_parent_id,
            note=f'comment from user {author_id}',
        )
        db.add(earn_entry)

    # Create comment
    comment = Comment(
        post_id=post_id,
        author_id=author_id,
        content=comment_data.content,
        parent_id=actual_parent_id,
        cost_paid=cost,
        interaction_status=InteractionStatus.SETTLED.value,
        locked_until=None,
        recipient_id=recipient_id,
    )
    db.add(comment)
    post.comments_count += 1

    # Log interaction
    is_reply = comment_data.parent_id is not None
    itype = InteractionType.REPLY if is_reply else InteractionType.COMMENT
    await _log_interaction(db, author_id, post.author_id, itype, post_id)

    await db.flush()
    await db.refresh(comment)

    return _comment_response(comment, author)


@router.get('/{post_id}/comments', response_model=list[CommentResponse])
async def get_comments(
    post_id: int,
    user_id: int | None = Query(None, description='Current user for is_liked'),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get comments for a post. Excludes cancelled/deleted comments."""
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.author))
        .where(
            and_(
                Comment.post_id == post_id,
                Comment.interaction_status != InteractionStatus.CANCELLED.value,
            )
        )
        .order_by(Comment.created_at)
        .limit(limit)
        .offset(offset)
    )
    comments = list(result.scalars().all())

    like_info_map = await _check_comment_liked(
        db, [c.id for c in comments], user_id or 0,
    )

    return [
        _comment_response(c, c.author, like_info=like_info_map.get(c.id))
        for c in comments
    ]


@router.delete('/comments/{comment_id}', status_code=status.HTTP_200_OK)
async def delete_comment(
    comment_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Delete a comment. Comments are free so no refund needed."""
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail='Comment not found')

    if comment.author_id != user_id:
        raise HTTPException(status_code=403, detail='Not authorized to delete this comment')

    if comment.interaction_status == InteractionStatus.CANCELLED.value:
        raise HTTPException(status_code=400, detail='Comment already deleted')

    # Update post comment count
    post = await db.get(Post, comment.post_id)
    if post:
        post.comments_count = max(0, post.comments_count - 1)

    # Soft delete
    comment.interaction_status = InteractionStatus.CANCELLED.value
    comment.content = '[deleted]'
    await db.commit()

    return {'status': 'deleted'}


# ── Comment Likes ────────────────────────────────────────────────────────────

@router.get('/{post_id}/comments/{comment_id}/like-cost')
async def get_comment_like_cost(
    post_id: int,
    comment_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get current dynamic like cost for a comment."""
    from app.services.dynamic_like_service import comment_like_cost
    
    comment = await db.get(Comment, comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail='Comment not found')
    
    return {
        'comment_id': comment_id,
        'likes_count': comment.likes_count,
        'like_cost': comment_like_cost(comment.likes_count),
    }


@router.post(
    '/{post_id}/comments/{comment_id}/like',
    status_code=status.HTTP_200_OK,
)
async def like_comment(
    post_id: int,
    comment_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Like a comment with 1h lock period.
    
    - Sats are locked for 1 hour before settlement
    - User can unlike within 1h for 90% refund
    - After 1h, like is settled and revenue is distributed
    """
    comment = await db.get(Comment, comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail='Comment not found')

    service = DynamicLikeService(db)
    try:
        result = await service.like_comment(user_id, comment_id)
        await db.commit()
        
        # Log interaction
        await _log_interaction(
            db, user_id, comment.author_id, InteractionType.COMMENT_LIKE, comment_id,
        )
        
        return {
            'likes_count': comment.likes_count,
            'is_liked': True,
            'like_status': result['status'],
            'locked_until': result['locked_until'].isoformat(),
            'cost': result['cost'],
            'your_weight': result['weight'],
            'like_rank': result['like_rank'],
        }
    except CannotLikeOwnPost:
        raise HTTPException(status_code=400, detail='Cannot like your own comment')
    except AlreadyLiked:
        like_info = await service.get_comment_like_status(user_id, comment_id)
        return {
            'likes_count': comment.likes_count,
            'is_liked': True,
            'like_status': like_info['status'] if like_info else None,
            'locked_until': like_info['locked_until'] if like_info else None,
        }
    except DynamicInsufficientBalance as e:
        raise HTTPException(status_code=402, detail=str(e))


@router.delete(
    '/{post_id}/comments/{comment_id}/like',
    status_code=status.HTTP_200_OK,
)
async def unlike_comment(
    post_id: int,
    comment_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Unlike a comment within the 1h lock period.
    
    - PENDING like: 90% refund, 10% to platform
    - SETTLED like: Cannot unlike (returns error)
    """
    comment = await db.get(Comment, comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail='Comment not found')

    service = DynamicLikeService(db)
    
    try:
        result = await service.unlike_comment(user_id, comment_id)
        await db.commit()
        
        if not result.get('success'):
            raise HTTPException(status_code=404, detail=result.get('error', 'Like not found'))
        
        return {
            'likes_count': comment.likes_count,
            'is_liked': False,
            'refund_amount': result.get('refund_amount', 0),
            'refund_rate': '90%',
        }
    except CannotUnlikeSettled:
        raise HTTPException(
            status_code=400,
            detail='Cannot unlike after 1h - like has been settled',
        )


# Boost endpoints removed in minimal system
