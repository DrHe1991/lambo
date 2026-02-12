from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.user import User
from app.models.post import Post, Comment, PostStatus
from app.schemas.post import PostCreate, PostUpdate, PostResponse, CommentCreate, CommentResponse
from app.schemas.user import UserBrief

router = APIRouter()


def build_post_response(post: Post, is_liked: bool = False) -> PostResponse:
    """Build PostResponse from Post model."""
    return PostResponse(
        id=post.id,
        author=UserBrief(
            id=post.author.id,
            name=post.author.name,
            handle=post.author.handle,
            avatar=post.author.avatar,
            trust_score=post.author.trust_score,
        ),
        content=post.content,
        post_type=post.post_type,
        status=post.status,
        likes_count=post.likes_count,
        comments_count=post.comments_count,
        bounty=post.bounty,
        is_ai=post.is_ai,
        created_at=post.created_at,
        is_liked=is_liked,
    )


@router.post('', response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_post(
    post_data: PostCreate,
    author_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a new post."""
    author = await db.get(User, author_id)
    if not author:
        raise HTTPException(status_code=404, detail='Author not found')

    post = Post(
        author_id=author_id,
        content=post_data.content,
        post_type=post_data.post_type,
        bounty=post_data.bounty,
    )
    db.add(post)
    await db.flush()

    # Load author relationship
    await db.refresh(post, ['author'])
    return build_post_response(post)


@router.get('', response_model=list[PostResponse])
async def get_posts(
    post_type: str | None = Query(None, pattern=r'^(note|question)$'),
    author_id: int | None = Query(None),
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
    posts = result.scalars().all()

    return [build_post_response(post) for post in posts]


@router.get('/feed', response_model=list[PostResponse])
async def get_feed(
    user_id: int = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get feed for a user (posts from followed users)."""
    from app.models.user import Follow

    # Get posts from users that current user follows
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
    posts = result.scalars().all()

    return [build_post_response(post) for post in posts]


@router.get('/{post_id}', response_model=PostResponse)
async def get_post(post_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single post by ID."""
    result = await db.execute(
        select(Post).options(selectinload(Post.author)).where(Post.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    return build_post_response(post)


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


# Comments
@router.post('/{post_id}/comments', response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    post_id: int,
    comment_data: CommentCreate,
    author_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a comment on a post."""
    post = await db.get(Post, post_id)
    if not post or post.status != PostStatus.ACTIVE.value:
        raise HTTPException(status_code=404, detail='Post not found')

    author = await db.get(User, author_id)
    if not author:
        raise HTTPException(status_code=404, detail='Author not found')

    # Validate parent comment if provided
    if comment_data.parent_id:
        parent = await db.get(Comment, comment_data.parent_id)
        if not parent or parent.post_id != post_id:
            raise HTTPException(status_code=400, detail='Invalid parent comment')

    comment = Comment(
        post_id=post_id,
        author_id=author_id,
        content=comment_data.content,
        parent_id=comment_data.parent_id,
    )
    db.add(comment)

    # Increment comment count
    post.comments_count += 1

    await db.flush()
    await db.refresh(comment)

    return CommentResponse(
        id=comment.id,
        post_id=comment.post_id,
        author=UserBrief(
            id=author.id,
            name=author.name,
            handle=author.handle,
            avatar=author.avatar,
            trust_score=author.trust_score,
        ),
        content=comment.content,
        parent_id=comment.parent_id,
        likes_count=comment.likes_count,
        created_at=comment.created_at,
    )


@router.get('/{post_id}/comments', response_model=list[CommentResponse])
async def get_comments(
    post_id: int,
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
    comments = result.scalars().all()

    return [
        CommentResponse(
            id=c.id,
            post_id=c.post_id,
            author=UserBrief(
                id=c.author.id,
                name=c.author.name,
                handle=c.author.handle,
                avatar=c.author.avatar,
                trust_score=c.author.trust_score,
            ),
            content=c.content,
            parent_id=c.parent_id,
            likes_count=c.likes_count,
            created_at=c.created_at,
        )
        for c in comments
    ]


@router.post('/{post_id}/like', status_code=status.HTTP_200_OK)
async def like_post(
    post_id: int,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Like a post (simple increment for now, P1 adds staking)."""
    post = await db.get(Post, post_id)
    if not post or post.status != PostStatus.ACTIVE.value:
        raise HTTPException(status_code=404, detail='Post not found')

    post.likes_count += 1
    return {'likes_count': post.likes_count}
