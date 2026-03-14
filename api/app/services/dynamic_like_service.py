"""
Dynamic Like Service - Core mechanism for the minimal system.

Two core rules:
1. Dynamic pricing: cost = max(min, base / sqrt(1 + likes))
2. Revenue split: 50% author, 40% early likers, 10% platform

Applies to both post likes and comment likes.
"""
from datetime import date
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.post import Post, PostLike, Comment, CommentLike
from app.models.ledger import Ledger, ActionType, RefType
from app.models.revenue import PlatformRevenue


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
        """Like a post with dynamic pricing and early supporter revenue sharing.
        
        Returns dict with like details and earnings distributed.
        """
        post = await self.db.get(Post, post_id)
        if not post:
            raise ValueError(f'Post {post_id} not found')

        if post.author_id == user_id:
            raise CannotLikeOwnPost('Cannot like your own post')

        # Check if already liked
        existing = await self.db.execute(
            select(PostLike).where(
                PostLike.post_id == post_id,
                PostLike.user_id == user_id
            )
        )
        if existing.scalar_one_or_none():
            raise AlreadyLiked('Already liked this post')

        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        # Calculate cost
        cost = like_cost(post.likes_count)

        if user.available_balance < cost:
            raise InsufficientBalance(
                f'Need {cost} sat but only have {user.available_balance}'
            )

        # Deduct from user
        user.available_balance -= cost
        await self._create_ledger(
            user_id, -cost, ActionType.SPEND_LIKE,
            RefType.POST, post_id, f'liked post {post_id}'
        )

        # Calculate shares
        author_share = int(cost * AUTHOR_SHARE)
        early_liker_share = int(cost * EARLY_LIKER_SHARE)
        platform_share = cost - author_share - early_liker_share

        # Pay author (50%)
        author = await self.db.get(User, post.author_id)
        if author and author_share > 0:
            author.available_balance += author_share
            await self._create_ledger(
                post.author_id, author_share, ActionType.EARN_LIKE,
                RefType.POST, post_id, f'like from user {user_id}'
            )

        # Distribute to early likers (40%)
        early_liker_earnings = await self._distribute_to_early_likers(
            post_id, early_liker_share
        )

        # Platform revenue (10%)
        await self._add_platform_revenue(platform_share)

        # Calculate weight for this like
        weight = liker_weight(cost, post.likes_count + 1)

        # Create like record
        new_like = PostLike(
            post_id=post_id,
            user_id=user_id,
            cost_paid=cost,
            total_weight=weight,
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
            'author_share': author_share,
            'early_liker_share': early_liker_share,
            'platform_share': platform_share,
            'weight': weight,
            'like_rank': post.likes_count,
            'early_liker_earnings': early_liker_earnings,
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

    async def unlike_post(self, user_id: int, post_id: int) -> bool:
        """Unlike a post. No refund in the minimal system."""
        result = await self.db.execute(
            select(PostLike).where(
                PostLike.post_id == post_id,
                PostLike.user_id == user_id
            )
        )
        like = result.scalar_one_or_none()

        if not like:
            return False

        # Remove like
        await self.db.delete(like)

        # Update post count
        post = await self.db.get(Post, post_id)
        if post and post.likes_count > 0:
            post.likes_count -= 1

        return True

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
        """Like a comment with dynamic pricing and early supporter revenue sharing."""
        comment = await self.db.get(Comment, comment_id)
        if not comment:
            raise ValueError(f'Comment {comment_id} not found')

        if comment.author_id == user_id:
            raise CannotLikeOwnPost('Cannot like your own comment')

        # Check if already liked
        existing = await self.db.execute(
            select(CommentLike).where(
                CommentLike.comment_id == comment_id,
                CommentLike.user_id == user_id
            )
        )
        if existing.scalar_one_or_none():
            raise AlreadyLiked('Already liked this comment')

        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        # Calculate cost
        cost = comment_like_cost(comment.likes_count)

        if user.available_balance < cost:
            raise InsufficientBalance(
                f'Need {cost} sat but only have {user.available_balance}'
            )

        # Deduct from user
        user.available_balance -= cost
        await self._create_ledger(
            user_id, -cost, ActionType.SPEND_COMMENT_LIKE,
            RefType.COMMENT, comment_id, f'liked comment {comment_id}'
        )

        # Calculate shares
        author_share = int(cost * AUTHOR_SHARE)
        early_liker_share = int(cost * EARLY_LIKER_SHARE)
        platform_share = cost - author_share - early_liker_share

        # Pay comment author (50%)
        author = await self.db.get(User, comment.author_id)
        if author and author_share > 0:
            author.available_balance += author_share
            await self._create_ledger(
                comment.author_id, author_share, ActionType.EARN_COMMENT,
                RefType.COMMENT, comment_id, f'comment like from user {user_id}'
            )

        # Distribute to early comment likers (40%)
        early_liker_earnings = await self._distribute_to_early_comment_likers(
            comment_id, early_liker_share
        )

        # Platform revenue (10%)
        await self._add_platform_revenue(platform_share)

        # Calculate weight for this like
        weight = liker_weight(cost, comment.likes_count + 1)

        # Create like record
        new_like = CommentLike(
            comment_id=comment_id,
            user_id=user_id,
            cost_paid=cost,
        )
        self.db.add(new_like)

        # Update comment like count
        comment.likes_count += 1

        await self.db.flush()

        return {
            'cost': cost,
            'author_share': author_share,
            'early_liker_share': early_liker_share,
            'platform_share': platform_share,
            'weight': weight,
            'like_rank': comment.likes_count,
            'early_liker_earnings': early_liker_earnings,
        }

    async def _distribute_to_early_comment_likers(
        self,
        comment_id: int,
        total_amount: int
    ) -> list[dict]:
        """Distribute revenue to previous comment likers based on cost paid."""
        if total_amount <= 0:
            return []

        # Get all existing likes
        result = await self.db.execute(
            select(CommentLike).where(CommentLike.comment_id == comment_id)
        )
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
                        RefType.COMMENT, comment_id, f'early comment supporter dividend'
                    )
                    distributed += share
                    earnings.append({
                        'user_id': like.user_id,
                        'share': share,
                    })

        remainder = total_amount - distributed
        if remainder > 0:
            await self._add_platform_revenue(remainder)

        return earnings

    async def unlike_comment(self, user_id: int, comment_id: int) -> bool:
        """Unlike a comment. No refund."""
        result = await self.db.execute(
            select(CommentLike).where(
                CommentLike.comment_id == comment_id,
                CommentLike.user_id == user_id
            )
        )
        like = result.scalar_one_or_none()

        if not like:
            return False

        await self.db.delete(like)

        comment = await self.db.get(Comment, comment_id)
        if comment and comment.likes_count > 0:
            comment.likes_count -= 1

        return True
