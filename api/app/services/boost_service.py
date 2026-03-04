"""
Boost Service - Paid content promotion

Allows users to pay sat to boost their posts' visibility.
- 50% goes to platform subsidy pool
- 50% is platform operational revenue
- Boost decays 30% daily
- Max 5x visibility multiplier
"""
from datetime import datetime, date
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.post import Post
from app.models.ledger import Ledger, ActionType, RefType
from app.models.revenue import PlatformRevenue

# Boost configuration
MIN_BOOST_AMOUNT = 1000  # Minimum 1000 sat (~$0.68)
SAT_PER_BOOST_POINT = 100  # 100 sat = 1 boost point
MAX_BOOST_MULTIPLIER = 5.0  # Max 5x visibility
DAILY_DECAY_RATE = 0.7  # 30% decay daily
POOL_SHARE = 0.5  # 50% goes to subsidy pool


class BoostService:
    """Handles post boosting and decay."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def boost_post(self, post_id: int, user_id: int, amount: int) -> dict:
        """Boost a post with sat payment.
        
        Args:
            post_id: Post to boost
            user_id: User paying for boost (must be author)
            amount: Amount in sat (minimum 1000)
            
        Returns:
            dict with boost details
        """
        # Validate amount
        if amount < MIN_BOOST_AMOUNT:
            return {'error': f'Minimum boost is {MIN_BOOST_AMOUNT} sat'}

        # Get post
        post = await self.db.get(Post, post_id)
        if not post:
            return {'error': 'Post not found'}

        # Only author can boost
        if post.author_id != user_id:
            return {'error': 'Can only boost your own posts'}

        # Get user
        user = await self.db.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        # Check balance
        if user.available_balance < amount:
            return {'error': 'Insufficient balance', 'required': amount}

        # Deduct from user
        user.available_balance -= amount
        self.db.add(Ledger(
            user_id=user_id,
            amount=-amount,
            balance_after=user.available_balance,
            action_type=ActionType.SPEND_BOOST.value,
            ref_type=RefType.POST.value,
            ref_id=post_id,
            note=f'Boost post {post_id}',
        ))

        # Calculate boost points
        boost_points = amount / SAT_PER_BOOST_POINT

        # Update post
        post.boost_amount += amount
        post.boost_remaining += boost_points

        # Record platform revenue (50% to pool, 50% operational)
        pool_share = int(amount * POOL_SHARE)
        await self._record_boost_revenue(pool_share)

        await self.db.flush()

        return {
            'post_id': post_id,
            'amount_paid': amount,
            'boost_points_added': boost_points,
            'total_boost_remaining': post.boost_remaining,
            'current_multiplier': self.get_boost_multiplier(post.boost_remaining),
            'estimated_duration_days': self._estimate_duration(post.boost_remaining),
        }

    def get_boost_multiplier(self, boost_remaining: float) -> float:
        """Calculate visibility multiplier from boost points."""
        return min(MAX_BOOST_MULTIPLIER, 1.0 + boost_remaining)

    def _estimate_duration(self, boost_remaining: float) -> int:
        """Estimate how many days until boost is negligible (<0.1)."""
        if boost_remaining <= 0:
            return 0
        days = 0
        remaining = boost_remaining
        while remaining > 0.1 and days < 30:
            remaining *= DAILY_DECAY_RATE
            days += 1
        return days

    async def _record_boost_revenue(self, amount: int):
        """Record boost revenue for today."""
        today = date.today()
        result = await self.db.execute(
            select(PlatformRevenue).where(PlatformRevenue.date == today)
        )
        rev = result.scalar_one_or_none()
        if rev:
            rev.boost_revenue += amount
            rev.total += amount
        else:
            self.db.add(PlatformRevenue(
                date=today,
                boost_revenue=amount,
                total=amount,
            ))
        await self.db.flush()

    async def decay_all_boosts(self) -> dict:
        """Apply daily decay to all boosted posts.
        
        Called by settlement worker daily.
        """
        result = await self.db.execute(
            select(Post).where(Post.boost_remaining > 0.01)
        )
        posts = list(result.scalars().all())

        decayed_count = 0
        for post in posts:
            old_value = post.boost_remaining
            post.boost_remaining *= DAILY_DECAY_RATE
            if post.boost_remaining < 0.01:
                post.boost_remaining = 0
            decayed_count += 1

        await self.db.flush()

        return {
            'posts_decayed': decayed_count,
            'decay_rate': DAILY_DECAY_RATE,
        }

    async def get_post_boost_info(self, post_id: int) -> dict | None:
        """Get boost info for a post."""
        post = await self.db.get(Post, post_id)
        if not post:
            return None

        return {
            'post_id': post_id,
            'boost_amount': post.boost_amount,
            'boost_remaining': post.boost_remaining,
            'current_multiplier': self.get_boost_multiplier(post.boost_remaining),
            'is_boosted': post.boost_remaining > 0.01,
        }


async def decay_all_boosts(db: AsyncSession) -> dict:
    """Convenience function for scheduler."""
    service = BoostService(db)
    return await service.decay_all_boosts()
