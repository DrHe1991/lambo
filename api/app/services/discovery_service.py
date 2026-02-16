"""Discovery Score calculator and reward settlement service.

Formulas from RULES_TABLE_ZH.md §4.2:
  like_weight = W_trust(liker) × N_novelty(liker, author) × S_source(liker, author)
  post_discovery_score = Σ like_weight
"""
from datetime import datetime, timedelta
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User, Follow
from app.models.post import Post, PostLike, Comment, CommentLike, PostStatus
from app.models.ledger import ActionType, RefType
from app.models.reward import (
    InteractionLog, RewardPool, PostReward, CommentReward,
    PoolStatus, SettlementStatus,
)
from app.services.ledger_service import LedgerService
from app.services.trust_service import TrustScoreService


# ── W_trust — trust tier weights ──────────────────────────────────────────────

W_TRUST_TABLE = [
    (0, 399, 0.5),     # White
    (400, 599, 1.0),   # Green
    (600, 749, 2.0),   # Blue
    (750, 899, 3.5),   # Purple
    (900, 1000, 6.0),  # Orange
]


def w_trust(trust_score: int) -> float:
    for lo, hi, w in W_TRUST_TABLE:
        if lo <= trust_score <= hi:
            return w
    return 0.5


# ── N_novelty — interaction freshness decay ───────────────────────────────────

N_NOVELTY_TABLE = [
    (0, 0, 1.00),     # First ever
    (1, 3, 0.60),
    (4, 10, 0.30),
    (11, 30, 0.12),
    (31, 999999, 0.05),
]


def n_novelty(interaction_count: int) -> float:
    for lo, hi, n in N_NOVELTY_TABLE:
        if lo <= interaction_count <= hi:
            return n
    return 0.05


# ── S_source — follower vs stranger ──────────────────────────────────────────

S_STRANGER = 1.00
S_FOLLOWER = 0.15

# Platform daily emission per DAU (sat)
EMISSION_PER_DAU = 300

# Reward split
AUTHOR_SHARE = 0.80
COMMENT_SHARE = 0.20


class DiscoveryService:
    """Calculates Discovery Score and runs settlement."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def calculate_post_score(self, post_id: int) -> float:
        """Calculate the Discovery Score for a single post."""
        post = await self.db.get(Post, post_id)
        if not post:
            return 0.0

        # Get all likes for this post with liker info
        result = await self.db.execute(
            select(PostLike, User)
            .join(User, PostLike.user_id == User.id)
            .where(PostLike.post_id == post_id)
        )
        likes = result.all()
        if not likes:
            return 0.0

        author_id = post.author_id
        total_score = 0.0

        for like, liker in likes:
            w = w_trust(liker.trust_score)
            n = await self._get_novelty(like.user_id, author_id)
            s = await self._get_source(like.user_id, author_id)
            total_score += w * n * s

        return total_score

    async def get_post_score_breakdown(self, post_id: int) -> dict:
        """Return detailed breakdown of Discovery Score for a post."""
        post = await self.db.get(Post, post_id)
        if not post:
            return {'total': 0.0, 'likes': []}

        result = await self.db.execute(
            select(PostLike, User)
            .join(User, PostLike.user_id == User.id)
            .where(PostLike.post_id == post_id)
        )
        likes = result.all()

        breakdown = []
        total = 0.0
        for like, liker in likes:
            w = w_trust(liker.trust_score)
            n = await self._get_novelty(like.user_id, post.author_id)
            s = await self._get_source(like.user_id, post.author_id)
            weight = w * n * s
            total += weight
            breakdown.append({
                'user_id': liker.id,
                'handle': liker.handle,
                'trust_score': liker.trust_score,
                'w_trust': w,
                'n_novelty': n,
                's_source': s,
                'weight': round(weight, 4),
            })

        return {'total': round(total, 4), 'likes': breakdown}

    async def calculate_comment_score(self, comment_id: int) -> float:
        """Calculate Discovery Score for a comment (based on comment likes)."""
        comment = await self.db.get(Comment, comment_id)
        if not comment:
            return 0.0

        result = await self.db.execute(
            select(CommentLike, User)
            .join(User, CommentLike.user_id == User.id)
            .where(CommentLike.comment_id == comment_id)
        )
        likes = result.all()
        if not likes:
            return 0.0

        author_id = comment.author_id
        total = 0.0
        for like, liker in likes:
            w = w_trust(liker.trust_score)
            n = await self._get_novelty(like.user_id, author_id)
            s = await self._get_source(like.user_id, author_id)
            total += w * n * s

        return total

    async def settle_mature_posts(self, before_date: datetime | None = None):
        """Settle all posts that have reached T+7d and haven't been settled yet.

        Returns summary dict.
        """
        if before_date is None:
            before_date = datetime.utcnow() - timedelta(days=7)

        settle_date_str = before_date.strftime('%Y-%m-%d')

        # Find unsettled posts created before the cutoff
        result = await self.db.execute(
            select(Post)
            .options(selectinload(Post.author))
            .where(
                and_(
                    Post.created_at <= before_date,
                    Post.status == PostStatus.ACTIVE.value,
                    ~Post.id.in_(
                        select(PostReward.post_id)
                        .where(PostReward.status == SettlementStatus.SETTLED.value)
                    ),
                )
            )
        )
        posts = list(result.scalars().all())

        if not posts:
            return {'settle_date': settle_date_str, 'posts_settled': 0, 'pool': 0}

        # Calculate Discovery Scores
        scores: dict[int, float] = {}
        for post in posts:
            scores[post.id] = await self.calculate_post_score(post.id)

        total_scores = sum(scores.values())

        # Calculate the daily pool
        pool_amount = await self._calculate_pool(posts)

        # Create or get RewardPool for this settlement date
        existing = await self.db.execute(
            select(RewardPool).where(RewardPool.settle_date == settle_date_str)
        )
        pool = existing.scalar_one_or_none()
        if not pool:
            pool = RewardPool(
                settle_date=settle_date_str,
                total_pool=pool_amount,
                post_count=len(posts),
            )
            self.db.add(pool)
            await self.db.flush()
        else:
            pool.total_pool += pool_amount
            pool.post_count += len(posts)

        ledger = LedgerService(self.db)
        total_distributed = 0
        settled_posts = []

        for post in posts:
            score = scores[post.id]

            # Calculate post reward based on share of total scores
            if total_scores > 0 and score > 0:
                post_reward_amount = int((score / total_scores) * pool_amount)
            else:
                post_reward_amount = 0

            author_reward = int(post_reward_amount * AUTHOR_SHARE)
            comment_pool_amount = post_reward_amount - author_reward

            # Create PostReward record
            pr = PostReward(
                post_id=post.id,
                pool_id=pool.id,
                discovery_score=score,
                author_reward=author_reward,
                comment_pool=comment_pool_amount,
                status=SettlementStatus.SETTLED.value,
                settled_at=datetime.utcnow(),
            )
            self.db.add(pr)
            await self.db.flush()

            # Pay author
            if author_reward > 0:
                await ledger.earn(
                    post.author_id, author_reward,
                    ActionType.REWARD_POST,
                    ref_type=RefType.POST, ref_id=post.id,
                    note=f'Post reward (score={score:.2f})',
                )
                total_distributed += author_reward

            # Distribute comment pool
            if comment_pool_amount > 0:
                distributed_comments = await self._settle_comments(
                    post.id, pr.id, comment_pool_amount, ledger,
                )
                total_distributed += distributed_comments

            settled_posts.append({
                'post_id': post.id,
                'author_id': post.author_id,
                'discovery_score': round(score, 4),
                'author_reward': author_reward,
                'comment_pool': comment_pool_amount,
            })

        # ── Trust score updates after settlement ─────────────────────────
        trust_svc = TrustScoreService(self.db)

        # Determine top 10% threshold
        score_values = sorted(scores.values(), reverse=True)
        top10_threshold = score_values[max(0, len(score_values) // 10)] if score_values else 0

        for post in posts:
            score = scores[post.id]

            # Author: Creator +2~+5 for settlement without violation
            if score > 0:
                await trust_svc.update_creator(post.author_id, 3, 'post settled')
            else:
                # Zero-engagement → small penalty
                await trust_svc.update_creator(post.author_id, -1, 'zero engagement')

            # Author: Creator +5~+15 if in top 10%
            if score >= top10_threshold > 0:
                bonus = min(15, max(5, int(score)))
                await trust_svc.update_creator(post.author_id, bonus, 'top 10% discovery')

            # Curators: update CuratorScore for likers of rewarded posts
            if score > 0:
                like_result = await self.db.execute(
                    select(PostLike).where(PostLike.post_id == post.id)
                )
                for (like,) in like_result.all():
                    await trust_svc.update_curator(like.user_id, 1, 'liked rewarded post')

        pool.total_distributed = total_distributed
        pool.status = PoolStatus.SETTLED.value
        pool.settled_at = datetime.utcnow()

        return {
            'settle_date': settle_date_str,
            'posts_settled': len(posts),
            'pool': pool_amount,
            'total_distributed': total_distributed,
            'total_scores': round(total_scores, 4),
            'posts': settled_posts,
        }

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _get_novelty(self, actor_id: int, target_user_id: int) -> float:
        """Count interactions in past 30 days → N_novelty decay."""
        cutoff = datetime.utcnow() - timedelta(days=30)
        result = await self.db.execute(
            select(func.count())
            .select_from(InteractionLog)
            .where(
                and_(
                    InteractionLog.actor_id == actor_id,
                    InteractionLog.target_user_id == target_user_id,
                    InteractionLog.created_at >= cutoff,
                )
            )
        )
        count = result.scalar() or 0
        # Subtract 1 because the current interaction was already logged
        count = max(0, count - 1)
        return n_novelty(count)

    async def _get_source(self, liker_id: int, author_id: int) -> float:
        """Check if liker follows author → S_source."""
        result = await self.db.execute(
            select(func.count())
            .select_from(Follow)
            .where(
                and_(
                    Follow.follower_id == liker_id,
                    Follow.following_id == author_id,
                )
            )
        )
        return S_FOLLOWER if result.scalar() else S_STRANGER

    async def _calculate_pool(self, posts: list[Post]) -> int:
        """Calculate the reward pool for this settlement batch.

        Pool = sum of all action fees collected for these posts
             + platform emission (300 × DAU estimate)
        """
        # Sum up cost_paid from these posts
        post_fees = sum(p.cost_paid for p in posts)

        # Sum up comment costs for these posts
        post_ids = [p.id for p in posts]
        result = await self.db.execute(
            select(func.coalesce(func.sum(Comment.cost_paid), 0))
            .where(Comment.post_id.in_(post_ids))
        )
        comment_fees = result.scalar() or 0

        # Sum up like costs (10 sat per like on these posts)
        result = await self.db.execute(
            select(func.count())
            .select_from(PostLike)
            .where(PostLike.post_id.in_(post_ids))
        )
        like_count = result.scalar() or 0
        like_fees = like_count * 10

        # Sum up comment like costs (5 sat per comment like)
        comment_ids_q = select(Comment.id).where(Comment.post_id.in_(post_ids))
        result = await self.db.execute(
            select(func.count())
            .select_from(CommentLike)
            .where(CommentLike.comment_id.in_(comment_ids_q))
        )
        comment_like_count = result.scalar() or 0
        comment_like_fees = comment_like_count * 5

        fees_total = int(post_fees) + int(comment_fees) + like_fees + comment_like_fees

        # Platform emission: estimate DAU as unique authors in this batch
        unique_authors = len(set(p.author_id for p in posts))
        dau_estimate = max(unique_authors, 1)
        emission = EMISSION_PER_DAU * dau_estimate

        return fees_total + emission

    async def _settle_comments(
        self, post_id: int, post_reward_id: int,
        pool_amount: int, ledger: LedgerService,
    ) -> int:
        """Distribute comment pool by comment Discovery Score."""
        # Get top-level comments (replies don't earn in Phase 1)
        result = await self.db.execute(
            select(Comment)
            .where(
                and_(
                    Comment.post_id == post_id,
                    Comment.parent_id.is_(None),
                )
            )
        )
        comments = list(result.scalars().all())
        if not comments:
            return 0

        # Calculate comment scores
        comment_scores: dict[int, float] = {}
        for c in comments:
            comment_scores[c.id] = await self.calculate_comment_score(c.id)

        total_cscore = sum(comment_scores.values())
        if total_cscore == 0:
            return 0

        distributed = 0
        for c in comments:
            cscore = comment_scores[c.id]
            if cscore <= 0:
                continue

            reward = int((cscore / total_cscore) * pool_amount)
            if reward <= 0:
                continue

            cr = CommentReward(
                comment_id=c.id,
                post_reward_id=post_reward_id,
                discovery_score=cscore,
                reward_amount=reward,
                settled_at=datetime.utcnow(),
            )
            self.db.add(cr)

            await ledger.earn(
                c.author_id, reward,
                ActionType.REWARD_COMMENT,
                ref_type=RefType.COMMENT, ref_id=c.id,
                note=f'Comment reward (score={cscore:.2f})',
            )
            distributed += reward

        return distributed
