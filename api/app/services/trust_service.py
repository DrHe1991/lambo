"""TrustScore management — 4 sub-dimensions → composite trust_score.

Formula: TrustScore = 0.30×Creator + 0.25×Curator + 0.25×Juror + 0.20×(1000 - Risk)
New user: Creator=500, Curator=500, Juror=500, Risk=0 → TrustScore = 550
"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

# Weights for composite score
W_CREATOR = 0.30
W_CURATOR = 0.25
W_JUROR = 0.25
W_RISK = 0.20

# Clamp bounds
SCORE_MIN = 0
SCORE_MAX = 1000


def compute_trust_score(
    creator: int, curator: int, juror: int, risk: int,
) -> int:
    """Pure function: compute composite TrustScore from sub-dimensions."""
    raw = (
        W_CREATOR * creator
        + W_CURATOR * curator
        + W_JUROR * juror
        + W_RISK * (1000 - risk)
    )
    return max(SCORE_MIN, min(SCORE_MAX, int(round(raw))))


def dynamic_fee_multiplier(trust_score: int) -> float:
    """K(trust) = clamp(1.4 - trust/1250, 0.6, 1.4)

    High trust → cheaper (0.6×), low trust → expensive (1.4×).
    """
    k = 1.4 - trust_score / 1250
    return max(0.6, min(1.4, round(k, 4)))


def trust_tier(trust_score: int) -> str:
    """Return visual tier name based on TrustScore."""
    if trust_score >= 900:
        return 'orange'
    if trust_score >= 750:
        return 'purple'
    if trust_score >= 600:
        return 'blue'
    if trust_score >= 400:
        return 'green'
    return 'white'


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
