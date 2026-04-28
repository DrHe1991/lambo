"""
Dynamic Like Service - Ascending bonding curve model with pool-based earnings.

Core mechanics:
1. ASCENDING price curve: cost = max(min, base * sqrt(1 + likes))
   - Early likers pay LESS (cheap entry, high risk, high potential)
   - Later likers pay MORE (price reflects validated content)
2. Revenue split: 10% author, 85% early likers, 5% platform
3. Author + platform paid instantly on like (3 DB writes per like)
4. Liker earnings accumulate in post.revenue_pool, distributed by cron every 60s
5. Likes are permanent — no unlike, no refund

Rate Limiting:
- Max 15 likes per hour per user (post + comment combined)
- Prevents bot spray-and-pray attacks on early positions
"""
from datetime import date, datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.models.post import Post, PostLike, Comment, CommentLike, InteractionStatus, PostStatus
from app.models.ledger import Ledger, ActionType, RefType
from app.models.revenue import PlatformRevenue

# Revenue split (platform % configurable via PLATFORM_SHARE_PCT env var)
PLATFORM_SHARE = settings.platform_share_pct / 100
AUTHOR_SHARE = 0.10
EARLY_LIKER_SHARE = 1.0 - AUTHOR_SHARE - PLATFORM_SHARE

# Post like pricing (ASCENDING curve: price grows with popularity)
POST_LIKE_COST_BASE = 10
POST_LIKE_COST_MIN = 10

# Comment like pricing (ASCENDING curve, smaller scale)
COMMENT_LIKE_COST_BASE = 3
COMMENT_LIKE_COST_MIN = 3

# Rate limiting
LIKES_PER_HOUR_LIMIT = 15


class InsufficientBalance(Exception):
    pass


class AlreadyLiked(Exception):
    pass


class CannotLikeOwnPost(Exception):
    pass


class RateLimitExceeded(Exception):
    pass


def like_cost(current_likes: int) -> int:
    """Calculate dynamic post like cost (ASCENDING curve).

    Formula: cost = max(10, 10 * sqrt(1 + likes))

    | likes | cost |
    |-------|------|
    |   0   |  10  |
    |   5   |  22  |
    |  10   |  31  |
    |  50   |  70  |
    | 100   | 100  |
    | 500   | 223  |
    """
    return max(POST_LIKE_COST_MIN, int(POST_LIKE_COST_BASE * (1 + current_likes) ** 0.5))


def comment_like_cost(current_likes: int) -> int:
    """Calculate dynamic comment like cost (ASCENDING curve, smaller scale).

    Formula: cost = max(3, 3 * sqrt(1 + likes))

    | likes | cost |
    |-------|------|
    |   0   |   3  |
    |   5   |   6  |
    |  10   |   9  |
    |  50+  |  21  |
    """
    return max(COMMENT_LIKE_COST_MIN, int(COMMENT_LIKE_COST_BASE * (1 + current_likes) ** 0.5))


def liker_weight(cost_paid: int, like_rank: int) -> float:
    """Equal weight (1.0). Early advantage comes from paying less and earning longer."""
    return 1.0


class DynamicLikeService:
    """Handles dynamic like pricing and pool-based early supporter revenue sharing."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def check_like_rate_limit(self, user_id: int) -> None:
        """Raises RateLimitExceeded if user exceeded 15 likes/hour."""
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)

        post_likes_result = await self.db.execute(
            select(func.count()).select_from(PostLike).where(
                PostLike.user_id == user_id,
                PostLike.created_at > one_hour_ago
            )
        )
        post_likes_count = post_likes_result.scalar() or 0

        comment_likes_result = await self.db.execute(
            select(func.count()).select_from(CommentLike).where(
                CommentLike.user_id == user_id,
                CommentLike.created_at > one_hour_ago
            )
        )
        comment_likes_count = comment_likes_result.scalar() or 0

        total_likes = post_likes_count + comment_likes_count
        if total_likes >= LIKES_PER_HOUR_LIMIT:
            raise RateLimitExceeded(
                f'Like limit reached ({LIKES_PER_HOUR_LIMIT}/hour). '
                f'Try again later.'
            )

    async def get_like_cost(self, post_id: int) -> int:
        """Get current like cost for a post."""
        post = await self.db.get(Post, post_id)
        if not post:
            raise ValueError(f'Post {post_id} not found')
        return like_cost(post.likes_count)

    async def like_post(self, user_id: int, post_id: int, locked_cost: int | None = None) -> dict:
        """Like a post. Permanent, no refund.

        Instantly pays author (10%) and platform (5%).
        Liker share (85%) goes to post.revenue_pool for batch distribution by cron.
        """
        await self.check_like_rate_limit(user_id)

        post = await self.db.get(Post, post_id)
        if not post:
            raise ValueError(f'Post {post_id} not found')

        existing_result = await self.db.execute(
            select(PostLike).where(
                PostLike.post_id == post_id,
                PostLike.user_id == user_id
            )
        )
        existing_like = existing_result.scalar_one_or_none()

        if existing_like:
            raise AlreadyLiked('Already liked this post')

        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        cost = locked_cost if locked_cost is not None else like_cost(post.likes_count)

        if user.available_balance < cost:
            raise InsufficientBalance(
                f'Need {cost} sat but only have {user.available_balance}'
            )

        # Deduct from liker
        user.available_balance -= cost
        await self._create_ledger(
            user_id, -cost, ActionType.SPEND_LIKE,
            RefType.POST, post_id, f'liked post {post_id}'
        )

        weight = liker_weight(cost, post.likes_count + 1)

        # Revenue split
        author_share = int(cost * AUTHOR_SHARE)
        liker_pool_share = int(cost * EARLY_LIKER_SHARE)
        platform_share = cost - author_share - liker_pool_share

        # First like has no prior likers — overflow to author
        prior_likers = post.likes_count
        if prior_likers == 0:
            author_share += liker_pool_share
            liker_pool_share = 0

        # Pay author instantly
        if post.author_id:
            author = await self.db.get(User, post.author_id)
            if author and author_share > 0:
                author.available_balance += author_share
                await self._create_ledger(
                    post.author_id, author_share, ActionType.EARN_LIKE,
                    RefType.POST, post_id,
                    f'like from user {user_id}'
                )

        # Accumulate liker share in pool
        post.revenue_pool += liker_pool_share

        # Platform revenue
        await self._add_platform_revenue(platform_share)

        # Create like record (immediately SETTLED)
        new_like = PostLike(
            post_id=post_id,
            user_id=user_id,
            cost_paid=cost,
            total_weight=weight,
            status=InteractionStatus.SETTLED.value,
            locked_until=None,
            recipient_id=post.author_id,
            w_trust=1.0,
            n_novelty=1.0,
            s_source=1.0,
            ce_entropy=1.0,
            cross_circle=1.0,
            cabal_penalty=1.0,
        )
        self.db.add(new_like)

        post.likes_count += 1

        await self.db.flush()

        return {
            'cost': cost,
            'weight': weight,
            'like_rank': post.likes_count,
            'status': InteractionStatus.SETTLED.value,
        }

    # ========== Comment Like Methods ==========

    async def get_comment_like_cost(self, comment_id: int) -> int:
        """Get current like cost for a comment."""
        comment = await self.db.get(Comment, comment_id)
        if not comment:
            raise ValueError(f'Comment {comment_id} not found')
        return comment_like_cost(comment.likes_count)

    async def like_comment(self, user_id: int, comment_id: int, locked_cost: int | None = None) -> dict:
        """Like a comment. Permanent, no refund.

        Instantly pays author (10%) and platform (5%).
        Liker share (85%) goes to comment.revenue_pool for batch distribution by cron.
        """
        await self.check_like_rate_limit(user_id)

        comment = await self.db.get(Comment, comment_id)
        if not comment:
            raise ValueError(f'Comment {comment_id} not found')

        existing_result = await self.db.execute(
            select(CommentLike).where(
                CommentLike.comment_id == comment_id,
                CommentLike.user_id == user_id
            )
        )
        existing_like = existing_result.scalar_one_or_none()

        if existing_like:
            raise AlreadyLiked('Already liked this comment')

        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        cost = locked_cost if locked_cost is not None else comment_like_cost(comment.likes_count)

        if user.available_balance < cost:
            raise InsufficientBalance(
                f'Need {cost} sat but only have {user.available_balance}'
            )

        # Deduct from liker
        user.available_balance -= cost
        await self._create_ledger(
            user_id, -cost, ActionType.SPEND_COMMENT_LIKE,
            RefType.COMMENT, comment_id, f'liked comment {comment_id}'
        )

        weight = liker_weight(cost, comment.likes_count + 1)

        # Revenue split
        author_share = int(cost * AUTHOR_SHARE)
        liker_pool_share = int(cost * EARLY_LIKER_SHARE)
        platform_share = cost - author_share - liker_pool_share

        prior_likers = comment.likes_count
        if prior_likers == 0:
            author_share += liker_pool_share
            liker_pool_share = 0

        # Pay comment author instantly
        if comment.author_id:
            author = await self.db.get(User, comment.author_id)
            if author and author_share > 0:
                author.available_balance += author_share
                await self._create_ledger(
                    comment.author_id, author_share, ActionType.EARN_COMMENT,
                    RefType.COMMENT, comment_id,
                    f'comment like from user {user_id}'
                )

        # Accumulate liker share in pool
        comment.revenue_pool += liker_pool_share

        # Platform revenue
        await self._add_platform_revenue(platform_share)

        # Create like record (immediately SETTLED)
        new_like = CommentLike(
            comment_id=comment_id,
            user_id=user_id,
            cost_paid=cost,
            status=InteractionStatus.SETTLED.value,
            locked_until=None,
            recipient_id=comment.author_id,
        )
        self.db.add(new_like)

        comment.likes_count += 1

        await self.db.flush()

        return {
            'cost': cost,
            'weight': weight,
            'like_rank': comment.likes_count,
            'status': InteractionStatus.SETTLED.value,
        }

    # ========== Pool Distribution (called by cron) ==========

    async def distribute_pools(self, batch_size: int = 100) -> dict:
        """Distribute accumulated revenue pools to likers. Called by cron every 60s."""
        posts_distributed = 0
        comments_distributed = 0
        total_sat_distributed = 0

        # Post pools
        posts_result = await self.db.execute(
            select(Post).where(Post.revenue_pool > 0).limit(batch_size)
        )
        for post in posts_result.scalars():
            distributed = await self._distribute_post_pool(post)
            if distributed > 0:
                posts_distributed += 1
                total_sat_distributed += distributed

        # Comment pools
        comments_result = await self.db.execute(
            select(Comment).where(Comment.revenue_pool > 0).limit(batch_size)
        )
        for comment in comments_result.scalars():
            distributed = await self._distribute_comment_pool(comment)
            if distributed > 0:
                comments_distributed += 1
                total_sat_distributed += distributed

        return {
            'posts_distributed': posts_distributed,
            'comments_distributed': comments_distributed,
            'total_sat_distributed': total_sat_distributed,
        }

    async def _distribute_post_pool(self, post: Post) -> int:
        """Distribute a post's revenue_pool equally among its likers. Returns sat distributed."""
        pool = post.revenue_pool
        if pool <= 0:
            return 0

        result = await self.db.execute(
            select(PostLike).where(
                PostLike.post_id == post.id,
                PostLike.status == InteractionStatus.SETTLED.value
            )
        )
        likers = list(result.scalars().all())

        if not likers:
            return 0

        share_each = pool // len(likers)
        if share_each == 0:
            return 0

        distributed = 0
        for like in likers:
            user = await self.db.get(User, like.user_id)
            if user:
                user.available_balance += share_each
                like.earnings += share_each
                distributed += share_each
                await self._create_ledger(
                    like.user_id, share_each, ActionType.EARN_LIKE,
                    RefType.POST, post.id, 'early supporter dividend'
                )

        post.revenue_pool -= distributed
        return distributed

    async def _distribute_comment_pool(self, comment: Comment) -> int:
        """Distribute a comment's revenue_pool equally among its likers."""
        pool = comment.revenue_pool
        if pool <= 0:
            return 0

        result = await self.db.execute(
            select(CommentLike).where(
                CommentLike.comment_id == comment.id,
                CommentLike.status == InteractionStatus.SETTLED.value
            )
        )
        likers = list(result.scalars().all())

        if not likers:
            return 0

        share_each = pool // len(likers)
        if share_each == 0:
            return 0

        distributed = 0
        for like in likers:
            user = await self.db.get(User, like.user_id)
            if user:
                user.available_balance += share_each
                distributed += share_each
                await self._create_ledger(
                    like.user_id, share_each, ActionType.EARN_COMMENT,
                    RefType.COMMENT, comment.id, 'early comment supporter dividend'
                )

        comment.revenue_pool -= distributed
        return distributed

    # ========== Status / Query Methods ==========

    async def get_like_status(self, user_id: int, post_id: int) -> dict | None:
        """Get the like status for a user's like on a post."""
        result = await self.db.execute(
            select(PostLike).where(
                PostLike.post_id == post_id,
                PostLike.user_id == user_id,
            )
        )
        like = result.scalar_one_or_none()
        if not like:
            return None

        return {
            'status': like.status,
            'cost_paid': like.cost_paid,
        }

    async def get_comment_like_status(self, user_id: int, comment_id: int) -> dict | None:
        """Get the like status for a user's like on a comment."""
        result = await self.db.execute(
            select(CommentLike).where(
                CommentLike.comment_id == comment_id,
                CommentLike.user_id == user_id,
            )
        )
        like = result.scalar_one_or_none()
        if not like:
            return None

        return {
            'status': like.status,
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
                'earnings': like.earnings,
                'created_at': like.created_at.isoformat(),
            })

        return likers

    # ========== Post Deletion ==========

    async def delete_post_with_refunds(self, post_id: int, author_id: int) -> dict:
        """Delete a post and handle financial cleanup.

        All likes are settled (no PENDING state). Undistributed revenue_pool
        goes to platform. Author earnings from this post are clawed back.
        """
        post = await self.db.get(Post, post_id)
        if not post:
            raise ValueError('Post not found')
        if post.author_id != author_id:
            raise ValueError('Not authorized')
        if post.status == PostStatus.DELETED.value:
            raise ValueError('Post already deleted')

        refund_summary: dict = {
            'settled_likes': 0,
            'author_clawback': 0,
            'pool_forfeited': 0,
            'bounty_refunded': 0,
        }

        # 1. Count settled post likes
        result = await self.db.execute(
            select(func.count()).select_from(PostLike).where(
                PostLike.post_id == post_id,
                PostLike.status == InteractionStatus.SETTLED.value,
            )
        )
        refund_summary['settled_likes'] = result.scalar() or 0

        # 2. Forfeit undistributed pool to platform
        if post.revenue_pool > 0:
            refund_summary['pool_forfeited'] = post.revenue_pool
            await self._add_platform_revenue(post.revenue_pool)
            post.revenue_pool = 0

        # 3. Claw back author earnings from this post
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
                        'earnings clawback — post deleted',
                    )
                    refund_summary['author_clawback'] = actual_clawback

        # 4. Forfeit comment pools on this post
        comments_result = await self.db.execute(
            select(Comment).where(Comment.post_id == post_id)
        )
        for comment in comments_result.scalars():
            if comment.revenue_pool > 0:
                await self._add_platform_revenue(comment.revenue_pool)
                refund_summary['pool_forfeited'] += comment.revenue_pool
                comment.revenue_pool = 0

        # 5. Handle bounty refund (question with unaccepted bounty)
        if post.bounty and post.bounty > 0:
            author = await self.db.get(User, author_id)
            if author:
                author.available_balance += post.bounty
                await self._create_ledger(
                    author_id, post.bounty, ActionType.REFUND_CANCEL,
                    RefType.POST, post_id,
                    'bounty refund — question deleted',
                )
                refund_summary['bounty_refunded'] = post.bounty

        # 6. Soft-delete the post
        post.status = PostStatus.DELETED.value

        return refund_summary

    # ========== Internal Helpers ==========

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
