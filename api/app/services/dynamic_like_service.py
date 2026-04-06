"""
Dynamic Like Service - Core mechanism for the minimal system.

Two core rules:
1. Dynamic pricing: cost = max(min, base / sqrt(1 + likes))
2. Revenue split: 50% author, 40% early likers, 10% platform

1h Lock System:
- Likes are locked for 1 hour before settlement
- User can cancel within 1h and get 90% refund
- After 1h, the like is settled and cannot be cancelled

Applies to both post likes and comment likes.
"""
from datetime import date, datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.post import Post, PostLike, Comment, CommentLike, InteractionStatus, PostStatus
from app.models.ledger import Ledger, ActionType, RefType
from app.models.revenue import PlatformRevenue

LOCK_DURATION_HOURS = 1
REFUND_RATE = 0.90


AUTHOR_SHARE = 0.50
EARLY_LIKER_SHARE = 0.40
PLATFORM_SHARE = 0.10

# Post like pricing
POST_LIKE_COST_BASE = 100
POST_LIKE_COST_MIN = 5

# Comment like pricing (cheaper than posts)
COMMENT_LIKE_COST_BASE = 20
COMMENT_LIKE_COST_MIN = 2


class InsufficientBalance(Exception):
    """Raised when user doesn't have enough sat."""
    pass


class AlreadyLiked(Exception):
    """Raised when user already liked the post."""
    pass


class CannotLikeOwnPost(Exception):
    """Raised when user tries to like their own post."""
    pass


class CannotUnlikeSettled(Exception):
    """Raised when user tries to unlike a settled like (after 1h)."""
    pass


def like_cost(current_likes: int) -> int:
    """Calculate dynamic post like cost.
    
    Formula: cost = max(5, 100 / sqrt(1 + likes))
    
    | likes | cost |
    |-------|------|
    |   0   | 100  |
    |   5   |  41  |
    |  20   |  22  |
    | 100   |  10  |
    | 500+  |   5  |
    """
    return max(POST_LIKE_COST_MIN, int(POST_LIKE_COST_BASE / (1 + current_likes) ** 0.5))


def comment_like_cost(current_likes: int) -> int:
    """Calculate dynamic comment like cost (cheaper than posts).
    
    Formula: cost = max(2, 20 / sqrt(1 + likes))
    
    | likes | cost |
    |-------|------|
    |   0   |  20  |
    |   5   |   8  |
    |  20   |   4  |
    |  50+  |   2  |
    """
    return max(COMMENT_LIKE_COST_MIN, int(COMMENT_LIKE_COST_BASE / (1 + current_likes) ** 0.5))


def liker_weight(cost_paid: int, like_rank: int) -> float:
    """Calculate liker's weight for revenue sharing.
    
    Earlier likers who paid more get higher weight.
    """
    early_bonus = max(1.0, 1.5 - (like_rank / 100) * 0.5)
    return cost_paid * early_bonus


class DynamicLikeService:
    """Handles dynamic like pricing and early supporter revenue sharing."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_like_cost(self, post_id: int) -> int:
        """Get current like cost for a post."""
        post = await self.db.get(Post, post_id)
        if not post:
            raise ValueError(f'Post {post_id} not found')
        return like_cost(post.likes_count)

    async def like_post(self, user_id: int, post_id: int) -> dict:
        """Like a post with 1h lock period.
        
        Sats are locked for 1 hour. User can cancel within this period (90% refund).
        After 1h, the like is settled and revenue is distributed.
        
        Returns dict with like details.
        """
        post = await self.db.get(Post, post_id)
        if not post:
            raise ValueError(f'Post {post_id} not found')

        # Check for existing like
        existing_result = await self.db.execute(
            select(PostLike).where(
                PostLike.post_id == post_id,
                PostLike.user_id == user_id
            )
        )
        existing_like = existing_result.scalar_one_or_none()
        
        # If active like exists, raise error
        if existing_like and existing_like.status != InteractionStatus.CANCELLED.value:
            raise AlreadyLiked('Already liked this post')
        
        # Delete any cancelled like to allow re-liking
        if existing_like and existing_like.status == InteractionStatus.CANCELLED.value:
            await self.db.delete(existing_like)
            await self.db.flush()

        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        # Calculate cost
        cost = like_cost(post.likes_count)

        if user.available_balance < cost:
            raise InsufficientBalance(
                f'Need {cost} sat but only have {user.available_balance}'
            )

        # Deduct from user (lock the sats)
        user.available_balance -= cost
        await self._create_ledger(
            user_id, -cost, ActionType.SPEND_LIKE,
            RefType.POST, post_id, f'liked post {post_id} (locked for 1h)'
        )

        # Calculate weight for this like
        weight = liker_weight(cost, post.likes_count + 1)

        # Set lock period
        locked_until = datetime.utcnow() + timedelta(hours=LOCK_DURATION_HOURS)

        # Create like record with PENDING status
        new_like = PostLike(
            post_id=post_id,
            user_id=user_id,
            cost_paid=cost,
            total_weight=weight,
            status=InteractionStatus.PENDING.value,
            locked_until=locked_until,
            recipient_id=post.author_id,
            w_trust=1.0,
            n_novelty=1.0,
            s_source=1.0,
            ce_entropy=1.0,
            cross_circle=1.0,
            cabal_penalty=1.0,
        )
        self.db.add(new_like)

        # Update post like count
        post.likes_count += 1

        await self.db.flush()

        return {
            'cost': cost,
            'weight': weight,
            'like_rank': post.likes_count,
            'status': InteractionStatus.PENDING.value,
            'locked_until': locked_until,
        }

    async def _distribute_to_early_likers(
        self,
        post_id: int,
        total_amount: int
    ) -> list[dict]:
        """Distribute revenue to all previous likers based on their weight."""
        if total_amount <= 0:
            return []

        # Get all existing likes
        result = await self.db.execute(
            select(PostLike).where(PostLike.post_id == post_id)
        )
        likes = list(result.scalars().all())

        if not likes:
            # No early likers, give to platform
            await self._add_platform_revenue(total_amount)
            return []

        # Calculate total weight
        total_weight = sum(like.total_weight for like in likes)
        if total_weight <= 0:
            await self._add_platform_revenue(total_amount)
            return []

        earnings = []
        distributed = 0

        for like in likes:
            share = int(total_amount * (like.total_weight / total_weight))
            if share > 0:
                liker = await self.db.get(User, like.user_id)
                if liker:
                    liker.available_balance += share
                    like.earnings += share  # Track cumulative earnings
                    await self._create_ledger(
                        like.user_id, share, ActionType.EARN_LIKE,
                        RefType.POST, post_id, f'early supporter dividend'
                    )
                    distributed += share
                    earnings.append({
                        'user_id': like.user_id,
                        'share': share,
                    })

        # Any remainder goes to platform (rounding)
        remainder = total_amount - distributed
        if remainder > 0:
            await self._add_platform_revenue(remainder)

        return earnings

    async def _create_ledger(
        self,
        user_id: int,
        amount: int,
        action_type: ActionType,
        ref_type: RefType,
        ref_id: int,
        note: str,
    ) -> Ledger:
        """Create a ledger entry."""
        user = await self.db.get(User, user_id)
        entry = Ledger(
            user_id=user_id,
            amount=amount,
            balance_after=user.available_balance,
            action_type=action_type.value,
            ref_type=ref_type.value,
            ref_id=ref_id,
            note=note,
        )
        self.db.add(entry)
        return entry

    async def _add_platform_revenue(self, amount: int) -> None:
        """Add revenue to today's platform pool."""
        if amount <= 0:
            return

        today = date.today()
        result = await self.db.execute(
            select(PlatformRevenue).where(PlatformRevenue.date == today)
        )
        revenue = result.scalar_one_or_none()

        if not revenue:
            revenue = PlatformRevenue(date=today)
            self.db.add(revenue)
            await self.db.flush()

        revenue.like_revenue += amount
        revenue.total += amount

    async def unlike_post(self, user_id: int, post_id: int) -> dict:
        """Unlike a post within the 1h lock period.
        
        - PENDING status: 90% refund, set status to CANCELLED
        - SETTLED status: Cannot unlike, raise CannotUnlikeSettled
        
        Returns dict with refund details.
        """
        result = await self.db.execute(
            select(PostLike).where(
                PostLike.post_id == post_id,
                PostLike.user_id == user_id,
                PostLike.status != InteractionStatus.CANCELLED.value
            )
        )
        like = result.scalar_one_or_none()

        if not like:
            return {'success': False, 'error': 'Like not found'}

        # Check if already settled
        if like.status == InteractionStatus.SETTLED.value:
            raise CannotUnlikeSettled('Cannot unlike after 1h - like has been settled')

        # Calculate 90% refund
        refund_amount = int(like.cost_paid * REFUND_RATE)
        platform_keeps = like.cost_paid - refund_amount

        # Refund user
        user = await self.db.get(User, user_id)
        if user:
            user.available_balance += refund_amount
            await self._create_ledger(
                user_id, refund_amount, ActionType.EARN_LIKE,
                RefType.POST, post_id, f'unlike refund (90% of {like.cost_paid})'
            )

        # Platform keeps 10%
        if platform_keeps > 0:
            await self._add_platform_revenue(platform_keeps)

        # Mark as cancelled (don't delete - keep record)
        like.status = InteractionStatus.CANCELLED.value

        # Update post count
        post = await self.db.get(Post, post_id)
        if post and post.likes_count > 0:
            post.likes_count -= 1

        return {
            'success': True,
            'refund_amount': refund_amount,
            'platform_keeps': platform_keeps,
        }

    async def settle_like(self, like: PostLike) -> dict:
        """Settle a single pending like after the 1h lock period.
        
        Distributes: 50% to author, 40% to early likers, 10% to platform.
        """
        if like.status != InteractionStatus.PENDING.value:
            return {'settled': False, 'reason': 'not pending'}

        if like.locked_until and datetime.utcnow() < like.locked_until:
            return {'settled': False, 'reason': 'still locked'}

        cost = like.cost_paid

        # Calculate shares
        author_share = int(cost * AUTHOR_SHARE)
        early_liker_share = int(cost * EARLY_LIKER_SHARE)
        platform_share = cost - author_share - early_liker_share

        # Pay author (50%)
        if like.recipient_id:
            author = await self.db.get(User, like.recipient_id)
            if author and author_share > 0:
                author.available_balance += author_share
                await self._create_ledger(
                    like.recipient_id, author_share, ActionType.EARN_LIKE,
                    RefType.POST, like.post_id, f'like settled from user {like.user_id}'
                )

        # Distribute to early likers (40%) - only SETTLED likes
        early_liker_earnings = await self._distribute_to_early_settled_likers(
            like.post_id, early_liker_share, exclude_like_id=like.id
        )

        # Platform revenue (10%)
        await self._add_platform_revenue(platform_share)

        # Mark as settled
        like.status = InteractionStatus.SETTLED.value

        return {
            'settled': True,
            'author_share': author_share,
            'early_liker_share': early_liker_share,
            'platform_share': platform_share,
            'early_liker_earnings': early_liker_earnings,
        }

    async def settle_expired_likes(self, post_id: int | None = None) -> list[dict]:
        """Settle all expired pending likes for a post (or all posts if None).
        
        Called on-demand when fetching posts to ensure state is current.
        IMPORTANT: Settles in created_at order to ensure fair revenue distribution.
        """
        query = select(PostLike).where(
            PostLike.status == InteractionStatus.PENDING.value,
            PostLike.locked_until < datetime.utcnow()
        ).order_by(PostLike.created_at)  # Critical: settle in order of creation
        
        if post_id:
            query = query.where(PostLike.post_id == post_id)

        result = await self.db.execute(query)
        pending_likes = list(result.scalars().all())

        settled = []
        for like in pending_likes:
            result = await self.settle_like(like)
            if result.get('settled'):
                settled.append({
                    'like_id': like.id,
                    'post_id': like.post_id,
                    'user_id': like.user_id,
                    **result,
                })

        return settled

    async def _distribute_to_early_settled_likers(
        self,
        post_id: int,
        total_amount: int,
        exclude_like_id: int | None = None
    ) -> list[dict]:
        """Distribute revenue to SETTLED likers only (not pending)."""
        if total_amount <= 0:
            return []

        # Get only SETTLED likes
        query = select(PostLike).where(
            PostLike.post_id == post_id,
            PostLike.status == InteractionStatus.SETTLED.value
        )
        if exclude_like_id:
            query = query.where(PostLike.id != exclude_like_id)

        result = await self.db.execute(query)
        likes = list(result.scalars().all())

        if not likes:
            await self._add_platform_revenue(total_amount)
            return []

        total_weight = sum(like.total_weight for like in likes)
        if total_weight <= 0:
            await self._add_platform_revenue(total_amount)
            return []

        earnings = []
        distributed = 0

        for like in likes:
            share = int(total_amount * (like.total_weight / total_weight))
            if share > 0:
                liker = await self.db.get(User, like.user_id)
                if liker:
                    liker.available_balance += share
                    like.earnings += share
                    await self._create_ledger(
                        like.user_id, share, ActionType.EARN_LIKE,
                        RefType.POST, post_id, f'early supporter dividend (settled)'
                    )
                    distributed += share
                    earnings.append({'user_id': like.user_id, 'share': share})

        remainder = total_amount - distributed
        if remainder > 0:
            await self._add_platform_revenue(remainder)

        return earnings

    async def get_like_status(self, user_id: int, post_id: int) -> dict | None:
        """Get the like status for a user's like on a post.
        
        Returns None if not liked, or dict with status and locked_until.
        """
        result = await self.db.execute(
            select(PostLike).where(
                PostLike.post_id == post_id,
                PostLike.user_id == user_id,
                PostLike.status != InteractionStatus.CANCELLED.value
            )
        )
        like = result.scalar_one_or_none()

        if not like:
            return None

        # Check if needs settlement
        if (like.status == InteractionStatus.PENDING.value and
                like.locked_until and datetime.utcnow() >= like.locked_until):
            await self.settle_like(like)

        return {
            'status': like.status,
            'locked_until': like.locked_until.isoformat() if like.locked_until else None,
            'cost_paid': like.cost_paid,
        }

    async def get_post_likers(self, post_id: int) -> list[dict]:
        """Get list of likers for a post with their weights and potential earnings."""
        result = await self.db.execute(
            select(PostLike).where(PostLike.post_id == post_id)
        )
        likes = list(result.scalars().all())

        likers = []
        for like in likes:
            user = await self.db.get(User, like.user_id)
            likers.append({
                'user_id': like.user_id,
                'username': user.name if user else 'unknown',
                'cost_paid': like.cost_paid,
                'weight': like.total_weight,
                'created_at': like.created_at.isoformat(),
            })

        return likers

    # ========== Comment Like Methods ==========

    async def get_comment_like_cost(self, comment_id: int) -> int:
        """Get current like cost for a comment."""
        comment = await self.db.get(Comment, comment_id)
        if not comment:
            raise ValueError(f'Comment {comment_id} not found')
        return comment_like_cost(comment.likes_count)

    async def like_comment(self, user_id: int, comment_id: int) -> dict:
        """Like a comment with 1h lock period, same as post likes.
        
        Sats are locked for 1 hour. User can cancel within this period (90% refund).
        After 1h, the like is settled and revenue is distributed.
        """
        comment = await self.db.get(Comment, comment_id)
        if not comment:
            raise ValueError(f'Comment {comment_id} not found')

        # Check for existing like
        existing_result = await self.db.execute(
            select(CommentLike).where(
                CommentLike.comment_id == comment_id,
                CommentLike.user_id == user_id
            )
        )
        existing_like = existing_result.scalar_one_or_none()
        
        # If active like exists, raise error
        if existing_like and existing_like.status != InteractionStatus.CANCELLED.value:
            raise AlreadyLiked('Already liked this comment')
        
        # Delete any cancelled like to allow re-liking
        if existing_like and existing_like.status == InteractionStatus.CANCELLED.value:
            await self.db.delete(existing_like)
            await self.db.flush()

        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        # Calculate cost
        cost = comment_like_cost(comment.likes_count)

        if user.available_balance < cost:
            raise InsufficientBalance(
                f'Need {cost} sat but only have {user.available_balance}'
            )

        # Deduct from user (lock the sats)
        user.available_balance -= cost
        await self._create_ledger(
            user_id, -cost, ActionType.SPEND_COMMENT_LIKE,
            RefType.COMMENT, comment_id, f'liked comment {comment_id} (locked for 1h)'
        )

        # Calculate weight for this like
        weight = liker_weight(cost, comment.likes_count + 1)

        # Set lock period
        locked_until = datetime.utcnow() + timedelta(hours=LOCK_DURATION_HOURS)

        # Create like record with PENDING status (no immediate distribution)
        new_like = CommentLike(
            comment_id=comment_id,
            user_id=user_id,
            cost_paid=cost,
            status=InteractionStatus.PENDING.value,
            locked_until=locked_until,
            recipient_id=comment.author_id,
        )
        self.db.add(new_like)

        # Update comment like count
        comment.likes_count += 1

        await self.db.flush()

        return {
            'cost': cost,
            'weight': weight,
            'like_rank': comment.likes_count,
            'status': InteractionStatus.PENDING.value,
            'locked_until': locked_until,
        }

    async def unlike_comment(self, user_id: int, comment_id: int) -> dict:
        """Unlike a comment within the 1h lock period.
        
        - PENDING status: 90% refund, set status to CANCELLED
        - SETTLED status: Cannot unlike, raise CannotUnlikeSettled
        
        Returns dict with refund details.
        """
        result = await self.db.execute(
            select(CommentLike).where(
                CommentLike.comment_id == comment_id,
                CommentLike.user_id == user_id,
                CommentLike.status != InteractionStatus.CANCELLED.value
            )
        )
        like = result.scalar_one_or_none()

        if not like:
            return {'success': False, 'error': 'Like not found'}

        # Check if already settled
        if like.status == InteractionStatus.SETTLED.value:
            raise CannotUnlikeSettled('Cannot unlike after 1h - like has been settled')

        # Calculate 90% refund
        refund_amount = int(like.cost_paid * REFUND_RATE)
        platform_keeps = like.cost_paid - refund_amount

        # Refund user
        user = await self.db.get(User, user_id)
        if user:
            user.available_balance += refund_amount
            await self._create_ledger(
                user_id, refund_amount, ActionType.EARN_COMMENT,
                RefType.COMMENT, comment_id, f'unlike refund (90% of {like.cost_paid})'
            )

        # Platform keeps 10%
        if platform_keeps > 0:
            await self._add_platform_revenue(platform_keeps)

        # Mark as cancelled
        like.status = InteractionStatus.CANCELLED.value

        # Update comment count
        comment = await self.db.get(Comment, comment_id)
        if comment and comment.likes_count > 0:
            comment.likes_count -= 1

        return {
            'success': True,
            'refund_amount': refund_amount,
            'platform_keeps': platform_keeps,
        }

    async def settle_comment_like(self, like: CommentLike) -> dict:
        """Settle a single pending comment like after the 1h lock period.
        
        Distributes: 50% to author, 40% to early likers, 10% to platform.
        """
        if like.status != InteractionStatus.PENDING.value:
            return {'settled': False, 'reason': 'not pending'}

        if like.locked_until and datetime.utcnow() < like.locked_until:
            return {'settled': False, 'reason': 'still locked'}

        cost = like.cost_paid

        # Calculate shares
        author_share = int(cost * AUTHOR_SHARE)
        early_liker_share = int(cost * EARLY_LIKER_SHARE)
        platform_share = cost - author_share - early_liker_share

        # Pay author (50%)
        if like.recipient_id:
            author = await self.db.get(User, like.recipient_id)
            if author and author_share > 0:
                author.available_balance += author_share
                await self._create_ledger(
                    like.recipient_id, author_share, ActionType.EARN_COMMENT,
                    RefType.COMMENT, like.comment_id, f'comment like settled from user {like.user_id}'
                )

        # Distribute to early likers (40%) - only SETTLED likes
        early_liker_earnings = await self._distribute_to_early_settled_comment_likers(
            like.comment_id, early_liker_share, exclude_like_id=like.id
        )

        # Platform revenue (10%)
        await self._add_platform_revenue(platform_share)

        # Mark as settled
        like.status = InteractionStatus.SETTLED.value

        return {
            'settled': True,
            'author_share': author_share,
            'early_liker_share': early_liker_share,
            'platform_share': platform_share,
            'early_liker_earnings': early_liker_earnings,
        }

    async def settle_expired_comment_likes(self, comment_id: int | None = None) -> list[dict]:
        """Settle all expired pending comment likes (or for a specific comment).
        
        Called by cron job. IMPORTANT: Settles in created_at order for fair distribution.
        """
        query = select(CommentLike).where(
            CommentLike.status == InteractionStatus.PENDING.value,
            CommentLike.locked_until < datetime.utcnow()
        ).order_by(CommentLike.created_at)  # Critical: settle in order of creation
        
        if comment_id:
            query = query.where(CommentLike.comment_id == comment_id)

        result = await self.db.execute(query)
        pending_likes = list(result.scalars().all())

        settled = []
        for like in pending_likes:
            result = await self.settle_comment_like(like)
            if result.get('settled'):
                settled.append({
                    'like_id': like.id,
                    'comment_id': like.comment_id,
                    'user_id': like.user_id,
                    **result,
                })

        return settled

    async def _distribute_to_early_settled_comment_likers(
        self,
        comment_id: int,
        total_amount: int,
        exclude_like_id: int | None = None
    ) -> list[dict]:
        """Distribute revenue to SETTLED comment likers only (not pending)."""
        if total_amount <= 0:
            return []

        # Get only SETTLED likes
        query = select(CommentLike).where(
            CommentLike.comment_id == comment_id,
            CommentLike.status == InteractionStatus.SETTLED.value
        )
        if exclude_like_id:
            query = query.where(CommentLike.id != exclude_like_id)

        result = await self.db.execute(query)
        likes = list(result.scalars().all())

        if not likes:
            await self._add_platform_revenue(total_amount)
            return []

        # Use cost_paid as weight
        total_weight = sum(like.cost_paid for like in likes)
        if total_weight <= 0:
            await self._add_platform_revenue(total_amount)
            return []

        earnings = []
        distributed = 0

        for like in likes:
            share = int(total_amount * (like.cost_paid / total_weight))
            if share > 0:
                liker = await self.db.get(User, like.user_id)
                if liker:
                    liker.available_balance += share
                    await self._create_ledger(
                        like.user_id, share, ActionType.EARN_COMMENT,
                        RefType.COMMENT, comment_id, f'early comment supporter dividend (settled)'
                    )
                    distributed += share
                    earnings.append({'user_id': like.user_id, 'share': share})

        remainder = total_amount - distributed
        if remainder > 0:
            await self._add_platform_revenue(remainder)

        return earnings

    # ========== Post Deletion with Refunds ==========

    async def delete_post_with_refunds(self, post_id: int, author_id: int) -> dict:
        """Delete a post and handle all financial cleanup.

        - PENDING likes: full refund to likers
        - SETTLED likes: early likers keep earnings, platform keeps cut
        - Author earnings from this post: clawed back
        - PENDING comment likes: full refund to likers
        - Bounty: refunded if post is a question
        """
        post = await self.db.get(Post, post_id)
        if not post:
            raise ValueError('Post not found')
        if post.author_id != author_id:
            raise ValueError('Not authorized')
        if post.status == PostStatus.DELETED.value:
            raise ValueError('Post already deleted')

        refund_summary: dict = {
            'pending_likes_refunded': 0,
            'settled_likes': 0,
            'author_clawback': 0,
            'comment_likes_refunded': 0,
            'bounty_refunded': 0,
            'total_refunded_to_likers': 0,
        }

        # 1. Handle post likes
        result = await self.db.execute(
            select(PostLike).where(
                PostLike.post_id == post_id,
                PostLike.status != InteractionStatus.CANCELLED.value,
            )
        )
        post_likes = list(result.scalars().all())

        for like in post_likes:
            if like.status == InteractionStatus.PENDING.value:
                liker = await self.db.get(User, like.user_id)
                if liker:
                    liker.available_balance += like.cost_paid
                    await self._create_ledger(
                        like.user_id, like.cost_paid, ActionType.REFUND_CANCEL,
                        RefType.POST, post_id,
                        f'post deleted — full refund of {like.cost_paid} sat',
                    )
                like.status = InteractionStatus.CANCELLED.value
                refund_summary['pending_likes_refunded'] += 1
                refund_summary['total_refunded_to_likers'] += like.cost_paid
            else:
                refund_summary['settled_likes'] += 1

        # 2. Claw back author earnings from this post's settled likes
        from app.models.ledger import Ledger
        earn_result = await self.db.execute(
            select(Ledger).where(
                Ledger.user_id == author_id,
                Ledger.ref_type == RefType.POST.value,
                Ledger.ref_id == post_id,
                Ledger.action_type == ActionType.EARN_LIKE.value,
                Ledger.amount > 0,
            )
        )
        author_earnings = list(earn_result.scalars().all())
        clawback_total = sum(e.amount for e in author_earnings)

        if clawback_total > 0:
            author = await self.db.get(User, author_id)
            if author:
                actual_clawback = min(clawback_total, author.available_balance)
                if actual_clawback > 0:
                    author.available_balance -= actual_clawback
                    await self._create_ledger(
                        author_id, -actual_clawback, ActionType.FINE,
                        RefType.POST, post_id,
                        f'earnings clawback — post deleted',
                    )
                    refund_summary['author_clawback'] = actual_clawback

        # 3. Handle comment likes (refund pending ones)
        comments_result = await self.db.execute(
            select(Comment).where(Comment.post_id == post_id)
        )
        post_comments = list(comments_result.scalars().all())
        comment_ids = [c.id for c in post_comments]

        if comment_ids:
            cl_result = await self.db.execute(
                select(CommentLike).where(
                    CommentLike.comment_id.in_(comment_ids),
                    CommentLike.status == InteractionStatus.PENDING.value,
                )
            )
            pending_comment_likes = list(cl_result.scalars().all())

            for cl in pending_comment_likes:
                liker = await self.db.get(User, cl.user_id)
                if liker:
                    liker.available_balance += cl.cost_paid
                    await self._create_ledger(
                        cl.user_id, cl.cost_paid, ActionType.REFUND_CANCEL,
                        RefType.COMMENT, cl.comment_id,
                        f'post deleted — comment like refund',
                    )
                cl.status = InteractionStatus.CANCELLED.value
                refund_summary['comment_likes_refunded'] += 1
                refund_summary['total_refunded_to_likers'] += cl.cost_paid

        # 4. Handle bounty refund (question with unaccepted bounty)
        if post.bounty and post.bounty > 0:
            author = await self.db.get(User, author_id)
            if author:
                author.available_balance += post.bounty
                await self._create_ledger(
                    author_id, post.bounty, ActionType.REFUND_CANCEL,
                    RefType.POST, post_id,
                    f'bounty refund — question deleted',
                )
                refund_summary['bounty_refunded'] = post.bounty

        # 5. Soft-delete the post
        post.status = PostStatus.DELETED.value

        return refund_summary

    async def get_comment_like_status(self, user_id: int, comment_id: int) -> dict | None:
        """Get the like status for a user's like on a comment.
        
        Returns None if not liked, or dict with status and locked_until.
        """
        result = await self.db.execute(
            select(CommentLike).where(
                CommentLike.comment_id == comment_id,
                CommentLike.user_id == user_id,
                CommentLike.status != InteractionStatus.CANCELLED.value
            )
        )
        like = result.scalar_one_or_none()

        if not like:
            return None

        # Check if needs settlement
        if (like.status == InteractionStatus.PENDING.value and
                like.locked_until and datetime.utcnow() >= like.locked_until):
            await self.settle_comment_like(like)

        return {
            'status': like.status,
            'locked_until': like.locked_until.isoformat() if like.locked_until else None,
            'cost_paid': like.cost_paid,
        }
