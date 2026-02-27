"""
Quality Subsidy Service

Distributes platform revenue to high-quality but underexposed content.
Based on simulator's distribute_quality_subsidy logic.
"""
from datetime import datetime, date, timedelta
from sqlalchemy import select, desc, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.post import Post, PostStatus, PostLike
from app.models.reward import InteractionLog
from app.models.revenue import PlatformRevenue
from app.models.ledger import Ledger, ActionType, RefType

# Subsidy parameters (aligned with simulator)
SUBSIDY_RATIO = 1.0              # 100% of platform revenue goes to subsidies
MIN_LIKES_FOR_SUBSIDY = 2        # Need at least 2 likes to qualify
QUALITY_DENSITY_THRESHOLD = 0.15  # Lower threshold: allow more content to qualify
LOW_EXPOSURE_PERCENTILE = 0.7    # Bottom 70% by likes get considered
CONTENT_AGE_MIN_DAYS = 1         # Must be at least 1 day old
CONTENT_AGE_MAX_DAYS = 30        # Max 30 days old

# Quality inference weights
WEIGHT_ENGAGEMENT = 0.35
WEIGHT_SOURCE_QUALITY = 0.35
WEIGHT_AUTHOR = 0.20
WEIGHT_NEGATIVE = 0.10


class SubsidyService:
    """Handles weekly quality-based subsidy distribution."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def distribute_weekly_subsidy(self) -> dict:
        """Distribute platform revenue to high-quality underexposed content.

        Called weekly by the settlement worker.
        Returns summary stats.
        """
        today = date.today()
        week_start = today - timedelta(days=7)

        # 1. Get undistributed platform revenue from the past week
        result = await self.db.execute(
            select(PlatformRevenue)
            .where(PlatformRevenue.date >= week_start)
            .where(PlatformRevenue.date < today)
            .where(PlatformRevenue.distributed == False)  # noqa: E712
        )
        revenue_records = list(result.scalars().all())

        if not revenue_records:
            return {'status': 'no_revenue', 'distributed': 0}

        total_revenue = sum(r.total for r in revenue_records)
        subsidy_pool = int(total_revenue * SUBSIDY_RATIO)

        if subsidy_pool <= 0:
            return {'status': 'no_pool', 'distributed': 0}

        # 2. Find eligible posts (created in last 30 days, not too new)
        eligible_posts = await self._find_eligible_posts()

        if not eligible_posts:
            return {'status': 'no_eligible_posts', 'pool': subsidy_pool, 'distributed': 0}

        # 3. Calculate quality density for each post
        posts_with_density = []
        for post, like_count, avg_liker_trust, author_trust, author_risk in eligible_posts:
            density = self._calculate_quality_density(
                like_count, avg_liker_trust, author_trust, author_risk, post.created_at
            )
            if density >= QUALITY_DENSITY_THRESHOLD:
                posts_with_density.append((post, density, like_count))

        if not posts_with_density:
            return {'status': 'no_quality_posts', 'pool': subsidy_pool, 'distributed': 0}

        # 4. Filter to underexposed (bottom 70% by likes)
        posts_with_density.sort(key=lambda x: x[2])  # Sort by likes ascending
        cutoff_idx = int(len(posts_with_density) * LOW_EXPOSURE_PERCENTILE)
        underexposed = posts_with_density[:max(1, cutoff_idx)]

        # 5. Distribute pool proportional to quality density
        total_density = sum(d for _, d, _ in underexposed)
        distributed = 0
        beneficiaries = []

        for post, density, like_count in underexposed:
            share = int(subsidy_pool * (density / total_density))
            if share <= 0:
                continue

            # Get author
            author = await self.db.get(User, post.author_id)
            if not author:
                continue

            # Skip malicious users
            if author.risk_score > 100:
                continue

            # Pay subsidy
            author.available_balance += share
            distributed += share

            # Log in ledger
            entry = Ledger(
                user_id=author.id,
                amount=share,
                balance_after=author.available_balance,
                action_type=ActionType.EARN_SUBSIDY.value,
                ref_type=RefType.POST.value,
                ref_id=post.id,
                note=f'Quality subsidy (density={density:.2f})',
            )
            self.db.add(entry)

            beneficiaries.append({
                'post_id': post.id,
                'author_id': author.id,
                'density': round(density, 3),
                'share': share,
            })

        # 6. Mark revenue records as distributed
        now = datetime.utcnow()
        for record in revenue_records:
            record.distributed = True
            record.distributed_at = now

        await self.db.flush()

        return {
            'status': 'success',
            'week_start': str(week_start),
            'week_end': str(today),
            'total_revenue': total_revenue,
            'pool': subsidy_pool,
            'distributed': distributed,
            'beneficiaries_count': len(beneficiaries),
            'beneficiaries': beneficiaries[:10],  # Top 10 for logging
        }

    async def _find_eligible_posts(self) -> list:
        """Find posts eligible for quality subsidy."""
        today = date.today()
        min_date = datetime.combine(today - timedelta(days=CONTENT_AGE_MAX_DAYS), datetime.min.time())
        max_date = datetime.combine(today - timedelta(days=CONTENT_AGE_MIN_DAYS), datetime.max.time())

        # Query: posts with like stats
        result = await self.db.execute(
            select(
                Post,
                func.count(PostLike.id).label('like_count'),
                func.coalesce(func.avg(User.trust_score), 500).label('avg_liker_trust'),
            )
            .outerjoin(PostLike, PostLike.post_id == Post.id)
            .outerjoin(User, User.id == PostLike.user_id)
            .where(Post.status == PostStatus.ACTIVE.value)
            .where(Post.created_at >= min_date)
            .where(Post.created_at <= max_date)
            .group_by(Post.id)
            .having(func.count(PostLike.id) >= MIN_LIKES_FOR_SUBSIDY)
        )
        rows = result.all()

        # Get author trust/risk for each post
        enriched = []
        for row in rows:
            post = row[0]
            like_count = row[1]
            avg_liker_trust = float(row[2])

            author = await self.db.get(User, post.author_id)
            author_trust = author.trust_score if author else 500
            author_risk = author.risk_score if author else 0

            enriched.append((post, like_count, avg_liker_trust, author_trust, author_risk))

        return enriched

    def _calculate_quality_density(
        self,
        like_count: int,
        avg_liker_trust: float,
        author_trust: int,
        author_risk: int,
        created_at: datetime,
    ) -> float:
        """Calculate quality density score for a post.

        Quality density = inferred_quality / (likes + 1)
        High density = high quality but few likes (underrated)
        """
        # Inferred quality components
        # 1. Source quality (who liked)
        source_quality = avg_liker_trust / 1000

        # 2. Author quality
        author_quality = author_trust / 1000

        # 3. Risk penalty
        risk_penalty = (author_risk / 500) * WEIGHT_NEGATIVE if author_risk > 0 else 0

        # Combined inferred quality
        inferred = (
            source_quality * WEIGHT_SOURCE_QUALITY +
            author_quality * WEIGHT_AUTHOR -
            risk_penalty
        )
        inferred = max(0.0, min(1.0, inferred))

        # Quality density = quality per like
        density = inferred / (like_count + 1)
        return density


async def run_weekly_subsidy(db: AsyncSession) -> dict:
    """Convenience function for scheduler."""
    service = SubsidyService(db)
    return await service.distribute_weekly_subsidy()
