from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, desc, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.user import User
from app.models.post import Post, Comment, PostStatus, PostType, PostLike, CommentLike
from app.models.ledger import ActionType, RefType, Ledger
from app.schemas.post import (
    PostCreate, PostUpdate, PostResponse, CommentCreate, CommentResponse,
)
from app.schemas.user import UserBrief
from app.services.ledger_service import LedgerService, InsufficientBalance
from app.services.trust_service import dynamic_fee_multiplier
from app.models.reward import InteractionLog, InteractionType

# Base costs (before K(trust) multiplier)
BASE_POST_COST = 200
BASE_QUESTION_COST = 300
BASE_ANSWER_COST = 200
BASE_COMMENT_COST = 50
BASE_REPLY_COST = 20
BASE_LIKE_POST_COST = 10
BASE_LIKE_COMMENT_COST = 5


def _apply_k(base_cost: int, trust_score: int) -> int:
    """Apply K(trust) dynamic fee multiplier to a base cost."""
    k = dynamic_fee_multiplier(trust_score)
    return max(1, int(round(base_cost * k)))

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


def build_post_response(post: Post, is_liked: bool = False) -> PostResponse:
    """Build PostResponse from Post model."""
    return PostResponse(
        id=post.id,
        author=_user_brief(post.author),
        content=post.content,
        post_type=post.post_type,
        status=post.status,
        likes_count=post.likes_count,
        comments_count=post.comments_count,
        bounty=post.bounty,
        cost_paid=post.cost_paid,
        is_ai=post.is_ai,
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
        cost_paid=c.cost_paid,
        is_liked=is_liked,
        created_at=c.created_at,
    )


async def _check_post_liked(db: AsyncSession, post_ids: list[int], user_id: int) -> set[int]:
    """Return set of post IDs that the user has liked."""
    if not post_ids or not user_id:
        return set()
    result = await db.execute(
        select(PostLike.post_id)
        .where(PostLike.user_id == user_id)
        .where(PostLike.post_id.in_(post_ids))
    )
    return set(result.scalars().all())


async def _check_comment_liked(db: AsyncSession, comment_ids: list[int], user_id: int) -> set[int]:
    """Return set of comment IDs that the user has liked."""
    if not comment_ids or not user_id:
        return set()
    result = await db.execute(
        select(CommentLike.comment_id)
        .where(CommentLike.user_id == user_id)
        .where(CommentLike.comment_id.in_(comment_ids))
    )
    return set(result.scalars().all())


# ── Posts ────────────────────────────────────────────────────────────────────

@router.post('', response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_post(
    post_data: PostCreate,
    author_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a new post. First post base-fee is free; bounty always costs."""
    author = await db.get(User, author_id)
    if not author:
        raise HTTPException(status_code=404, detail='Author not found')

    is_question = post_data.post_type == PostType.QUESTION.value
    raw_cost = BASE_QUESTION_COST if is_question else BASE_POST_COST
    base_cost = _apply_k(raw_cost, author.trust_score)
    action_type = ActionType.SPEND_QUESTION if is_question else ActionType.SPEND_POST
    bounty = post_data.bounty or 0
    ledger = LedgerService(db)

    # Free post only waives the base fee, not the bounty
    is_free = author.free_posts_remaining > 0
    fee_paid = 0 if is_free else base_cost
    total_cost = fee_paid + bounty

    # Check total balance upfront
    if total_cost > author.available_balance:
        raise HTTPException(
            status_code=402,
            detail=f'Insufficient balance. Need {total_cost} sat.',
        )

    if is_free:
        author.free_posts_remaining -= 1

    # Deduct base fee
    if fee_paid > 0:
        await ledger.spend(
            author_id, fee_paid, action_type,
            ref_type=RefType.POST, ref_id=None,
            note=f'Post ({post_data.post_type})',
        )

    # Deduct bounty
    if bounty > 0:
        await ledger.spend(
            author_id, bounty, ActionType.SPEND_BOOST,
            ref_type=RefType.POST, ref_id=None,
            note=f'Question bounty ({bounty} sat)',
        )

    post = Post(
        author_id=author_id,
        content=post_data.content,
        post_type=post_data.post_type,
        bounty=post_data.bounty,
        cost_paid=fee_paid + bounty,
    )
    db.add(post)
    await db.flush()

    # Fix up ledger ref_ids now that we have the post ID
    from sqlalchemy import update as sql_update

    if is_free:
        free_entry = Ledger(
            user_id=author_id,
            amount=0,
            balance_after=author.available_balance,
            action_type=ActionType.FREE_POST.value,
            ref_type=RefType.POST.value,
            ref_id=post.id,
            note='Free post (1st post bonus)',
        )
        db.add(free_entry)
        await db.flush()
    else:
        await db.execute(
            sql_update(Ledger)
            .where(Ledger.user_id == author_id)
            .where(Ledger.ref_id.is_(None))
            .where(Ledger.action_type == action_type.value)
            .values(ref_id=post.id)
        )

    if bounty > 0:
        await db.execute(
            sql_update(Ledger)
            .where(Ledger.user_id == author_id)
            .where(Ledger.ref_id.is_(None))
            .where(Ledger.action_type == ActionType.SPEND_BOOST.value)
            .values(ref_id=post.id)
        )

    await db.refresh(post, ['author'])
    return build_post_response(post)


@router.get('', response_model=list[PostResponse])
async def get_posts(
    post_type: str | None = Query(None, pattern=r'^(note|question)$'),
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

    liked_ids = await _check_post_liked(db, [p.id for p in posts], user_id or 0)
    return [build_post_response(p, is_liked=p.id in liked_ids) for p in posts]


@router.get('/feed', response_model=list[PostResponse])
async def get_feed(
    user_id: int = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get feed for a user (posts from followed users)."""
    from app.models.user import Follow

    query = (
        select(Post)
        .options(selectinload(Post.author))
        .join(Follow, Follow.following_id == Post.author_id)
        .where(Follow.follower_id == user_id)
        .where(Post.status == PostStatus.ACTIVE.value)
        .order_by(desc(Post.created_at))
        .limit(limit)
        .offset(offset)
    )

    result = await db.execute(query)
    posts = list(result.scalars().all())

    liked_ids = await _check_post_liked(db, [p.id for p in posts], user_id)
    return [build_post_response(p, is_liked=p.id in liked_ids) for p in posts]


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

    liked_ids = await _check_post_liked(db, [post.id], user_id or 0)
    return build_post_response(post, is_liked=post.id in liked_ids)


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


# ── Post Likes ───────────────────────────────────────────────────────────────

@router.post('/{post_id}/like', status_code=status.HTTP_200_OK)
async def like_post(
    post_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Like a post. Costs 10 sat. Idempotent (double-like returns existing)."""
    post = await db.get(Post, post_id)
    if not post or post.status != PostStatus.ACTIVE.value:
        raise HTTPException(status_code=404, detail='Post not found')
    if post.author_id == user_id:
        raise HTTPException(status_code=400, detail='Cannot like your own post')

    # Check if already liked
    existing = await db.execute(
        select(PostLike).where(
            and_(PostLike.post_id == post_id, PostLike.user_id == user_id)
        )
    )
    if existing.scalar_one_or_none():
        return {'likes_count': post.likes_count, 'is_liked': True}

    # Spend sat
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    like_cost = _apply_k(BASE_LIKE_POST_COST, user.trust_score)
    ledger = LedgerService(db)
    try:
        await ledger.spend(
            user_id, like_cost, ActionType.SPEND_LIKE,
            ref_type=RefType.POST, ref_id=post_id,
            note=f'Like post ({like_cost} sat)',
        )
    except InsufficientBalance:
        raise HTTPException(
            status_code=402,
            detail=f'Insufficient balance. Need {like_cost} sat.',
        )

    db.add(PostLike(post_id=post_id, user_id=user_id))
    post.likes_count += 1
    await _log_interaction(db, user_id, post.author_id, InteractionType.LIKE, post_id)
    await db.flush()

    return {'likes_count': post.likes_count, 'is_liked': True}


@router.delete('/{post_id}/like', status_code=status.HTTP_200_OK)
async def unlike_post(
    post_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Unlike a post. No refund."""
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    result = await db.execute(
        select(PostLike).where(
            and_(PostLike.post_id == post_id, PostLike.user_id == user_id)
        )
    )
    like = result.scalar_one_or_none()
    if not like:
        return {'likes_count': post.likes_count, 'is_liked': False}

    await db.delete(like)
    post.likes_count = max(0, post.likes_count - 1)
    await db.flush()

    return {'likes_count': post.likes_count, 'is_liked': False}


# ── Comments ─────────────────────────────────────────────────────────────────

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
    """Create a comment / reply / answer. Costs sat based on type."""
    post = await db.get(Post, post_id)
    if not post or post.status != PostStatus.ACTIVE.value:
        raise HTTPException(status_code=404, detail='Post not found')

    author = await db.get(User, author_id)
    if not author:
        raise HTTPException(status_code=404, detail='Author not found')

    # Determine cost and action type
    is_reply = comment_data.parent_id is not None
    is_answer = (
        post.post_type == PostType.QUESTION.value
        and not is_reply
    )

    # Cannot answer your own question
    if is_answer and post.author_id == author_id:
        raise HTTPException(status_code=400, detail='Cannot answer your own question')

    if is_answer:
        cost = _apply_k(BASE_ANSWER_COST, author.trust_score)
        action_type = ActionType.SPEND_ANSWER
        note = 'Answer'
    elif is_reply:
        cost = _apply_k(BASE_REPLY_COST, author.trust_score)
        action_type = ActionType.SPEND_REPLY
        note = 'Reply'
    else:
        cost = _apply_k(BASE_COMMENT_COST, author.trust_score)
        action_type = ActionType.SPEND_COMMENT
        note = 'Comment'

    # Validate parent comment
    if comment_data.parent_id:
        parent = await db.get(Comment, comment_data.parent_id)
        if not parent or parent.post_id != post_id:
            raise HTTPException(status_code=400, detail='Invalid parent comment')

    # Charge
    ledger = LedgerService(db)
    try:
        await ledger.spend(
            author_id, cost, action_type,
            ref_type=RefType.COMMENT, ref_id=None,
            note=note,
        )
    except InsufficientBalance:
        raise HTTPException(
            status_code=402,
            detail=f'Insufficient balance. Need {cost} sat.',
        )

    comment = Comment(
        post_id=post_id,
        author_id=author_id,
        content=comment_data.content,
        parent_id=comment_data.parent_id,
        cost_paid=cost,
    )
    db.add(comment)
    post.comments_count += 1

    # Log interaction with post author
    itype = InteractionType.REPLY if is_reply else InteractionType.COMMENT
    await _log_interaction(db, author_id, post.author_id, itype, post_id)

    await db.flush()
    await db.refresh(comment)

    # Update ledger ref_id
    from sqlalchemy import update as sql_update
    await db.execute(
        sql_update(Ledger)
        .where(Ledger.user_id == author_id)
        .where(Ledger.ref_id.is_(None))
        .where(Ledger.action_type == action_type.value)
        .values(ref_id=comment.id)
    )

    return _comment_response(comment, author)


@router.get('/{post_id}/comments', response_model=list[CommentResponse])
async def get_comments(
    post_id: int,
    user_id: int | None = Query(None, description='Current user for is_liked'),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get comments for a post."""
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.author))
        .where(Comment.post_id == post_id)
        .order_by(Comment.created_at)
        .limit(limit)
        .offset(offset)
    )
    comments = list(result.scalars().all())

    liked_ids = await _check_comment_liked(
        db, [c.id for c in comments], user_id or 0,
    )

    return [
        _comment_response(c, c.author, is_liked=c.id in liked_ids)
        for c in comments
    ]


# ── Comment Likes ────────────────────────────────────────────────────────────

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
    """Like a comment. Costs 5 sat."""
    comment = await db.get(Comment, comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail='Comment not found')
    if comment.author_id == user_id:
        raise HTTPException(status_code=400, detail='Cannot like your own comment')

    # Check if already liked
    existing = await db.execute(
        select(CommentLike).where(
            and_(CommentLike.comment_id == comment_id, CommentLike.user_id == user_id)
        )
    )
    if existing.scalar_one_or_none():
        return {'likes_count': comment.likes_count, 'is_liked': True}

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    cl_cost = _apply_k(BASE_LIKE_COMMENT_COST, user.trust_score)
    ledger = LedgerService(db)
    try:
        await ledger.spend(
            user_id, cl_cost, ActionType.SPEND_COMMENT_LIKE,
            ref_type=RefType.COMMENT, ref_id=comment_id,
            note=f'Like comment ({cl_cost} sat)',
        )
    except InsufficientBalance:
        raise HTTPException(
            status_code=402,
            detail=f'Insufficient balance. Need {cl_cost} sat.',
        )

    db.add(CommentLike(comment_id=comment_id, user_id=user_id))
    comment.likes_count += 1
    await _log_interaction(
        db, user_id, comment.author_id, InteractionType.COMMENT_LIKE, comment_id,
    )
    await db.flush()

    return {'likes_count': comment.likes_count, 'is_liked': True}


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
    """Unlike a comment. No refund."""
    comment = await db.get(Comment, comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail='Comment not found')

    result = await db.execute(
        select(CommentLike).where(
            and_(CommentLike.comment_id == comment_id, CommentLike.user_id == user_id)
        )
    )
    like = result.scalar_one_or_none()
    if not like:
        return {'likes_count': comment.likes_count, 'is_liked': False}

    await db.delete(like)
    comment.likes_count = max(0, comment.likes_count - 1)
    await db.flush()

    return {'likes_count': comment.likes_count, 'is_liked': False}
