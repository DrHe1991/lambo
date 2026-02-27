"""
Like Weight Service

Calculates full like weight components:
- W_trust: Liker trust tier weight
- N_novelty: Interaction freshness with author
- S_source: Stranger vs follower
- CE_entropy: Consensus diversity (multiple trust tiers liking)
- Cross_circle: Cross-circle bonus
- Cabal_penalty: Cabal member penalty
"""
import math
from datetime import datetime, timedelta
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, Follow
from app.models.post import Post, PostLike
from app.models.reward import InteractionLog
from app.services.trust_service import trust_tier, TrustTier, compute_trust_score


# W_trust: Trust tier weights
TRUST_TIER_WEIGHTS = {
    TrustTier.WHITE: 0.5,
    TrustTier.GREEN: 1.0,
    TrustTier.BLUE: 2.0,
    TrustTier.PURPLE: 4.0,
    TrustTier.ORANGE: 6.0,
}

# N_novelty: Interaction freshness thresholds
NOVELTY_THRESHOLDS = [
    (0, 1.00),    # First interaction
    (3, 0.60),    # 1-3 interactions
    (10, 0.30),   # 4-10 interactions
    (30, 0.12),   # 11-30 interactions
    (999999, 0.05),  # 30+ interactions
]

# S_source: Follower penalty
S_SOURCE_FOLLOWER = 0.15
S_SOURCE_STRANGER = 1.0

# Cross-circle bonus
CROSS_CIRCLE_BONUS = 1.5
CROSS_CIRCLE_NONE = 1.0

# Cabal penalty
CABAL_PENALTY_ACTIVE = 0.3
CABAL_PENALTY_NONE = 1.0
CABAL_RISK_THRESHOLD = 150  # Risk > 150 = suspected cabal member


class LikeWeightService:
    """Calculate like weight components."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def calculate_like_weight(
        self,
        liker_id: int,
        post_id: int,
    ) -> dict:
        """Calculate all weight components for a like.
        
        Returns dict with all components and total_weight.
        """
        # Get liker and post
        liker = await self.db.get(User, liker_id)
        post = await self.db.get(Post, post_id)
        
        if not liker or not post:
            return self._default_weights()
        
        author_id = post.author_id
        
        # Calculate each component
        w_trust = await self._calc_w_trust(liker)
        n_novelty = await self._calc_n_novelty(liker_id, author_id)
        s_source = await self._calc_s_source(liker_id, author_id)
        is_cross_circle = s_source == S_SOURCE_STRANGER
        cross_circle = CROSS_CIRCLE_BONUS if is_cross_circle else CROSS_CIRCLE_NONE
        cabal_penalty = await self._calc_cabal_penalty(liker)
        ce_entropy = await self._calc_ce_entropy(post_id)
        
        # Total weight
        total_weight = (
            w_trust * n_novelty * s_source * 
            ce_entropy * cross_circle * cabal_penalty
        )
        
        return {
            'w_trust': round(w_trust, 4),
            'n_novelty': round(n_novelty, 4),
            's_source': round(s_source, 4),
            'ce_entropy': round(ce_entropy, 4),
            'cross_circle': round(cross_circle, 4),
            'cabal_penalty': round(cabal_penalty, 4),
            'total_weight': round(total_weight, 4),
            'is_cross_circle': is_cross_circle,
        }

    async def _calc_w_trust(self, liker: User) -> float:
        """W_trust: Weight based on liker's trust tier."""
        fresh_trust = compute_trust_score(
            liker.creator_score, liker.curator_score,
            liker.juror_score, liker.risk_score,
        )
        tier_str = trust_tier(fresh_trust)
        tier = TrustTier(tier_str)
        return TRUST_TIER_WEIGHTS.get(tier, 1.0)

    async def _calc_n_novelty(self, liker_id: int, author_id: int) -> float:
        """N_novelty: Decay based on past interactions with author."""
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        
        result = await self.db.execute(
            select(func.count(InteractionLog.id))
            .where(
                InteractionLog.actor_id == liker_id,
                InteractionLog.target_user_id == author_id,
                InteractionLog.created_at >= thirty_days_ago,
            )
        )
        interaction_count = result.scalar() or 0
        
        # Find matching threshold
        for threshold, novelty in NOVELTY_THRESHOLDS:
            if interaction_count <= threshold:
                return novelty
        return 0.05

    async def _calc_s_source(self, liker_id: int, author_id: int) -> float:
        """S_source: Stranger (1.0) vs Follower (0.15)."""
        result = await self.db.execute(
            select(Follow.id).where(
                Follow.follower_id == liker_id,
                Follow.following_id == author_id,
            )
        )
        is_following = result.scalar() is not None
        return S_SOURCE_FOLLOWER if is_following else S_SOURCE_STRANGER

    async def _calc_cabal_penalty(self, liker: User) -> float:
        """Cabal penalty based on risk score."""
        if liker.risk_score >= CABAL_RISK_THRESHOLD:
            return CABAL_PENALTY_ACTIVE
        return CABAL_PENALTY_NONE

    async def _calc_ce_entropy(self, post_id: int) -> float:
        """CE_entropy: Consensus entropy - diversity of trust tiers liking this post.
        
        Higher entropy = more diverse likers = higher weight.
        Range: 0.02 (single tier) to 10.0 (all tiers represented)
        """
        # Get existing likes with their liker trust scores
        result = await self.db.execute(
            select(User.creator_score, User.curator_score, User.juror_score, User.risk_score)
            .join(PostLike, PostLike.user_id == User.id)
            .where(PostLike.post_id == post_id)
        )
        likers = result.all()
        
        if len(likers) < 2:
            # Not enough data for entropy calculation
            return 1.0
        
        # Count likers per tier
        tier_counts = {tier: 0 for tier in TrustTier}
        for creator, curator, juror, risk in likers:
            ts = compute_trust_score(creator, curator, juror, risk)
            tier_str = trust_tier(ts)
            tier = TrustTier(tier_str)
            tier_counts[tier] += 1
        
        # Calculate Shannon entropy
        total = sum(tier_counts.values())
        if total == 0:
            return 1.0
            
        entropy = 0.0
        for count in tier_counts.values():
            if count > 0:
                p = count / total
                entropy -= p * math.log2(p)
        
        # Normalize: max entropy is log2(5) ≈ 2.32 (5 tiers)
        max_entropy = math.log2(5)
        normalized = entropy / max_entropy if max_entropy > 0 else 0
        
        # Scale to range [0.02, 10.0]
        # 0 entropy (single tier) → 0.02
        # 1.0 normalized (max diversity) → 10.0
        ce_value = 0.02 + normalized * 9.98
        return min(10.0, max(0.02, ce_value))

    def _default_weights(self) -> dict:
        """Default weights when user/post not found."""
        return {
            'w_trust': 1.0,
            'n_novelty': 1.0,
            's_source': 1.0,
            'ce_entropy': 1.0,
            'cross_circle': 1.0,
            'cabal_penalty': 1.0,
            'total_weight': 1.0,
            'is_cross_circle': False,
        }
