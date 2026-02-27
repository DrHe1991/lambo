"""TrustScore management — 4 sub-dimensions → composite trust_score.

Formula (S8): TrustScore = Creator × 0.6 + Curator × 0.3 + Juror_bonus - Risk_penalty
  - Juror_bonus = max(0, (Juror - 300) × 0.1)
  - Risk_penalty = (Risk / 50)^2 for Risk <= 100, else 125 + (Risk - 100) × 5

New user: Creator=150, Curator=150, Juror=300, Risk=30 → TrustScore ≈ 135
"""
from sqlalchemy.ext.asyncio import AsyncSession
from enum import Enum

from app.models.user import User

# Weights for composite score (S8 formula)
W_CREATOR = 0.6
W_CURATOR = 0.3
JUROR_BASELINE = 300
JUROR_BONUS_MULT = 0.1

# Clamp bounds - creator/curator can exceed 1000 (no hard cap)
SCORE_MIN = 0
SCORE_MAX = 99999  # Effectively no cap for top creators


class TrustTier(str, Enum):
    """Trust tier visual categories."""
    WHITE = 'white'
    GREEN = 'green'
    BLUE = 'blue'
    PURPLE = 'purple'
    ORANGE = 'orange'


# Trust tier ranges (S8)
TRUST_TIER_RANGES = {
    TrustTier.WHITE: (0, 150),
    TrustTier.GREEN: (151, 250),
    TrustTier.BLUE: (251, 400),
    TrustTier.PURPLE: (401, 700),
    TrustTier.ORANGE: (701, 99999),
}

# Tier reward multiplier - higher tiers get reduced rewards (diminishing returns)
TIER_REWARD_MULTIPLIER = {
    TrustTier.WHITE: 1.0,
    TrustTier.GREEN: 0.7,
    TrustTier.BLUE: 0.5,
    TrustTier.PURPLE: 0.3,
    TrustTier.ORANGE: 0.15,
}


def compute_trust_score(
    creator: int, curator: int, juror: int, risk: int,
) -> int:
    """Compute composite TrustScore from sub-dimensions (S8 formula).
    
    Formula: Creator × 0.6 + Curator × 0.3 + Juror_bonus - Risk_penalty
    """
    # Base score from creator and curator
    base = creator * W_CREATOR + curator * W_CURATOR
    
    # Juror bonus (only if above baseline)
    juror_bonus = max(0, (juror - JUROR_BASELINE) * JUROR_BONUS_MULT)
    
    # Risk penalty (quadratic for low risk, linear for high risk)
    if risk <= 100:
        risk_penalty = (risk / 50) ** 2
    else:
        # Dramatic penalty for high risk
        risk_penalty = 125 + (risk - 100) * 5
    
    raw = base + juror_bonus - risk_penalty
    return max(SCORE_MIN, int(round(raw)))


def dynamic_fee_multiplier(trust_score: int) -> float:
    """K(trust) = clamp(1.4 - trust/1250, 0.6, 1.4)

    High trust → cheaper (0.6×), low trust → expensive (1.4×).
    """
    k = 1.4 - trust_score / 1250
    return max(0.6, min(1.4, round(k, 4)))


def trust_tier(trust_score: int) -> str:
    """Return visual tier name based on TrustScore (S8 ranges)."""
    for tier, (low, high) in TRUST_TIER_RANGES.items():
        if low <= trust_score <= high:
            return tier.value
    return TrustTier.WHITE.value


def get_tier_multiplier(trust_score: int) -> float:
    """Get reward multiplier for current tier (higher tiers get less)."""
    tier_str = trust_tier(trust_score)
    tier = TrustTier(tier_str)
    return TIER_REWARD_MULTIPLIER.get(tier, 1.0)


class TrustScoreService:
    """Manages trust sub-score updates and recomputation."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def recalculate(self, user_id: int) -> int:
        """Recompute trust_score from sub-dimensions and save."""
        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        user.trust_score = compute_trust_score(
            user.creator_score, user.curator_score,
            user.juror_score, user.risk_score,
        )
        return user.trust_score

    async def update_creator(self, user_id: int, delta: int, reason: str = '') -> int:
        """Adjust CreatorScore by delta. Clamps to [0, 1000]."""
        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        user.creator_score = _clamp(user.creator_score + delta)
        user.trust_score = compute_trust_score(
            user.creator_score, user.curator_score,
            user.juror_score, user.risk_score,
        )
        return user.trust_score

    async def update_curator(self, user_id: int, delta: int, reason: str = '') -> int:
        """Adjust CuratorScore by delta."""
        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        user.curator_score = _clamp(user.curator_score + delta)
        user.trust_score = compute_trust_score(
            user.creator_score, user.curator_score,
            user.juror_score, user.risk_score,
        )
        return user.trust_score

    async def update_juror(self, user_id: int, delta: int, reason: str = '') -> int:
        """Adjust JurorScore by delta."""
        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        user.juror_score = _clamp(user.juror_score + delta)
        user.trust_score = compute_trust_score(
            user.creator_score, user.curator_score,
            user.juror_score, user.risk_score,
        )
        return user.trust_score

    async def update_risk(self, user_id: int, delta: int, reason: str = '') -> int:
        """Adjust RiskScore by delta. Higher = riskier."""
        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        user.risk_score = _clamp(user.risk_score + delta)
        user.trust_score = compute_trust_score(
            user.creator_score, user.curator_score,
            user.juror_score, user.risk_score,
        )
        return user.trust_score

    async def get_breakdown(self, user_id: int) -> dict:
        """Return full trust breakdown for a user."""
        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        ts = compute_trust_score(
            user.creator_score, user.curator_score,
            user.juror_score, user.risk_score,
        )
        k = dynamic_fee_multiplier(ts)
        return {
            'user_id': user.id,
            'trust_score': ts,
            'tier': trust_tier(ts),
            'fee_multiplier': k,
            'creator_score': user.creator_score,
            'curator_score': user.curator_score,
            'juror_score': user.juror_score,
            'risk_score': user.risk_score,
        }


def _clamp(value: int) -> int:
    return max(SCORE_MIN, min(SCORE_MAX, value))
