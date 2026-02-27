"""
BitLink Economic Simulator - Data Models
User, Post, Like, Challenge entities
"""

from dataclasses import dataclass, field
from typing import List, Dict, Set, Optional
from enum import Enum
import random
import uuid

from config import (
    UserType, TrustTier, UserBehaviorProfile, USER_PROFILES,
    get_trust_tier, IP_WEIGHTS
)


@dataclass
class ReputationScores:
    """
    四维信誉系统 v3 - Creator 主导，无硬顶，Risk 惩罚加重
    
    TrustScore = Creator × 0.6 + Curator × 0.3 + Juror_bonus - Risk_penalty
    
    - Creator: 无上限，初始 150
    - Curator: 无上限，初始 150
    - Juror_bonus: max(0, (Juror - 300) × 0.1)
    - Risk_penalty: (Risk / 50)^2，加重惩罚
    
    新用户初始: Creator=150, Curator=150, Juror=300, Risk=30 → TrustScore ≈ 134
    """
    # 维度分数 (无上限)
    creator: float = 150.0   # 创作者分：无上限，主要贡献来源
    curator: float = 150.0   # 策展人分：无上限，权重为 creator 一半
    juror: float = 300.0     # 陪审员分：300 是基准，超过才有加成
    risk: float = 30.0       # 风险分：新用户低风险起步
    
    # 行为计数器（用于追踪活跃度）
    posts_count: int = 0
    likes_count: int = 0
    challenges_count: int = 0
    
    def calculate_trust_score(self) -> float:
        """
        TrustScore = Creator × 0.6 + Curator × 0.3 + Juror_bonus - Risk_penalty
        无硬顶，可突破 1000
        Risk 惩罚采用分段设计：低风险影响小，高风险惩罚重
        """
        base = self.creator * 0.6 + self.curator * 0.3
        juror_bonus = max(0, (self.juror - 300) * 0.1)
        
        # Risk penalty: exponential for high risk users
        # risk < 50: mild penalty
        # risk 50-100: moderate penalty  
        # risk > 100: severe penalty (cabal/violators)
        if self.risk <= 50:
            risk_penalty = self.risk * 0.5  # max 25
        elif self.risk <= 100:
            risk_penalty = 25 + (self.risk - 50) * 2  # 25 + up to 100 = 125
        else:
            risk_penalty = 125 + (self.risk - 100) * 5  # severe: 5 per point above 100
        
        return max(0, base + juror_bonus - risk_penalty)
    
    def apply_change(self, dimension: str, change: float, tier_multiplier: float = 1.0):
        """
        应用信誉变化，正向奖励受 tier_multiplier 影响（等级越高递减）
        负向惩罚不递减，始终全额扣除
        """
        # 负向变化不递减
        if change < 0:
            effective_change = change
        else:
            effective_change = change * tier_multiplier
        
        if dimension == 'creator':
            self.creator = max(0, self.creator + effective_change)
        elif dimension == 'curator':
            self.curator = max(0, self.curator + effective_change)
        elif dimension == 'juror':
            self.juror = max(0, self.juror + effective_change)
        elif dimension == 'risk':
            # Risk 变化不受等级影响
            self.risk = max(0, min(1000, self.risk + change))
    
    def record_post(self):
        """记录发帖行为"""
        self.posts_count += 1
    
    def record_like(self):
        """记录点赞行为"""
        self.likes_count += 1
    
    def record_challenge(self):
        """记录举报行为"""
        self.challenges_count += 1


@dataclass
class User:
    """Represents a platform user"""
    id: str
    user_type: UserType
    profile: UserBehaviorProfile
    
    # Economics
    balance: float = 0.0
    total_earned: float = 0.0
    total_spent: float = 0.0
    total_penalty: float = 0.0
    
    # Reputation
    reputation: ReputationScores = field(default_factory=ReputationScores)
    
    # Social graph
    followers: Set[str] = field(default_factory=set)
    following: Set[str] = field(default_factory=set)
    
    # Interaction history (user_id -> count in last 30 days)
    interaction_history: Dict[str, int] = field(default_factory=dict)
    
    # Cabal membership (None if not in a cabal)
    cabal_id: Optional[str] = None
    
    # Activity tracking
    posts_created: int = 0
    likes_given: int = 0
    comments_made: int = 0
    challenges_initiated: int = 0
    challenges_won: int = 0
    challenges_lost: int = 0
    violations_committed: int = 0
    
    # Metrics
    scout_score: float = 0.0
    days_active: int = 0
    account_age: int = 0
    
    # Individual variation multipliers (set in create())
    individual_multipliers: Dict[str, float] = field(default_factory=dict)
    
    # Cabal penalty tracking
    cabal_penalty_until: int = 0  # Day until which penalty applies
    is_cabal_penalized: bool = False
    
    # Daily free action tracking (reset each day)
    free_posts_used: int = 0
    free_comments_used: int = 0
    free_likes_used: int = 0
    last_free_reset_day: int = -1
    
    @property
    def trust_score(self) -> float:
        return self.reputation.calculate_trust_score()
    
    @property
    def trust_tier(self) -> TrustTier:
        return get_trust_tier(self.trust_score)
    
    @property
    def influence_breadth(self) -> float:
        """Calculate influence index based on follower quality"""
        total = 0.0
        # This will be calculated by the simulation engine
        # as it needs access to all users
        return total
    
    @property
    def k_factor(self) -> float:
        """Fee discount/premium based on trust score"""
        return max(0.6, min(1.4, 1.4 - self.trust_score / 1250))
    
    def can_afford(self, amount: float) -> bool:
        return self.balance >= amount
    
    def spend(self, amount: float) -> bool:
        if self.can_afford(amount):
            self.balance -= amount
            self.total_spent += amount
            return True
        return False
    
    def earn(self, amount: float):
        self.balance += amount
        self.total_earned += amount
    
    def penalize(self, amount: float):
        actual = min(self.balance, amount)
        self.balance -= actual
        self.total_penalty += actual
        # If can't pay full penalty, increase risk score
        if actual < amount:
            shortfall_ratio = (amount - actual) / amount
            self.reputation.apply_change('risk', 20 * shortfall_ratio)
    
    def record_interaction(self, other_user_id: str):
        """Record an interaction with another user"""
        if other_user_id in self.interaction_history:
            self.interaction_history[other_user_id] += 1
        else:
            self.interaction_history[other_user_id] = 1
    
    def get_interaction_count(self, other_user_id: str) -> int:
        return self.interaction_history.get(other_user_id, 0)
    
    def decay_interactions(self, factor: float = 0.9):
        """Decay interaction counts (call monthly)"""
        to_remove = []
        for uid, count in self.interaction_history.items():
            new_count = int(count * factor)
            if new_count == 0:
                to_remove.append(uid)
            else:
                self.interaction_history[uid] = new_count
        for uid in to_remove:
            del self.interaction_history[uid]
    
    def reset_daily_free_actions(self, day: int):
        """Reset daily free actions if it's a new day"""
        if day != self.last_free_reset_day:
            self.free_posts_used = 0
            self.free_comments_used = 0
            self.free_likes_used = 0
            self.last_free_reset_day = day
    
    @classmethod
    def create(cls, user_type: UserType, user_id: str = None) -> 'User':
        if user_id is None:
            user_id = str(uuid.uuid4())[:8]
        
        profile = USER_PROFILES[user_type]
        initial_balance = random.randint(*profile.initial_balance)
        
        # Apply individual variation to create unique user instance
        # Import here to avoid circular dependency
        from config import INDIVIDUAL_VARIATION
        
        # Create a modified profile with individual variation
        var = INDIVIDUAL_VARIATION
        
        user = cls(
            id=user_id,
            user_type=user_type,
            profile=profile,
            balance=initial_balance,
        )
        
        # Store individual multipliers for this user
        user.individual_multipliers = {
            'post_rate': 1.0 + random.uniform(-var, var),
            'like_rate': 1.0 + random.uniform(-var, var),
            'comment_rate': 1.0 + random.uniform(-var, var),
            'quality': 1.0 + random.uniform(-var/2, var/2),  # Less variance in quality
        }
        
        return user


class ContentType(Enum):
    POST = 'post'
    QUESTION = 'question'
    ANSWER = 'answer'
    COMMENT = 'comment'
    REPLY = 'reply'


class ContentStatus(Enum):
    ACTIVE = 'active'
    CHALLENGED = 'challenged'
    REMOVED = 'removed'
    SETTLED = 'settled'


@dataclass
class Like:
    """Represents a like on content"""
    id: str
    user_id: str
    content_id: str
    created_day: int
    
    # Discovery score contribution (calculated at like time)
    w_trust: float = 0.0
    n_novelty: float = 0.0
    s_source: float = 0.0
    ce_entropy: float = 0.0
    scout_mult: float = 1.0
    
    # NEW: Store liker's trust score for audience quality calculation
    liker_trust_score: float = 600.0  # Default to blue tier
    
    # NEW: Cabal penalty flag (if liker is penalized cabal member)
    cabal_penalty_mult: float = 1.0  # 1.0 = no penalty, 0.3 = penalized
    
    # NEW: Cross-circle bonus (liker is not following author)
    cross_circle_mult: float = 1.0  # 1.0 = in-circle, 1.5 = cross-circle
    
    @property
    def weight(self) -> float:
        base_weight = self.w_trust * self.n_novelty * self.s_source * self.ce_entropy * self.scout_mult
        return base_weight * self.cabal_penalty_mult * self.cross_circle_mult


@dataclass
class Content:
    """Represents a post, question, answer, comment, or reply"""
    id: str
    author_id: str
    content_type: ContentType
    created_day: int
    
    # Quality (0-1, determined by author's content_quality + randomness)
    quality: float = 0.5
    
    # Human pledge
    human_pledge: bool = False
    is_ai_generated: bool = False
    is_plagiarism: bool = False
    
    # Violation info
    is_violation: bool = False
    violation_type: Optional[str] = None
    
    # Status
    status: ContentStatus = ContentStatus.ACTIVE
    
    # Economics
    cost_paid: float = 0.0
    reward_earned: float = 0.0
    
    # Post Boost (花钱买曝光)
    boost_amount: float = 0.0       # 总 boost 金额 (sat)
    boost_remaining: float = 0.0    # 当前剩余 boost 值 (每日衰减)
    
    # Engagement
    likes: List[Like] = field(default_factory=list)
    comments: List[str] = field(default_factory=list)  # List of comment IDs
    
    # Parent (for comments/replies/answers)
    parent_id: Optional[str] = None
    
    @property
    def discovery_score(self) -> float:
        """
        Legacy discovery score (sum of like weights with diminishing returns).
        For full recommendation logic, use recommendation.calculate_discovery_score()
        """
        import math
        
        if not self.likes:
            return 0.0
        
        # Base score from like weights
        base_score = sum(like.weight for like in self.likes)
        
        # Diminishing returns for popular content
        n = len(self.likes)
        if n > 1:
            diminishing_factor = math.log(n + 1) / n
            base_score = base_score * diminishing_factor
        
        return base_score
    
    @property
    def engagement_rate(self) -> float:
        """Calculate engagement metrics for quality inference"""
        if not self.likes:
            return 0.0
        
        # Cross-circle ratio (indicator of organic reach)
        cross_circle_likes = sum(1 for l in self.likes if l.cross_circle_mult > 1.0)
        cross_ratio = cross_circle_likes / len(self.likes)
        
        # Average liker trust (indicator of audience quality)
        avg_trust = sum(l.liker_trust_score for l in self.likes) / len(self.likes)
        trust_factor = avg_trust / 1000
        
        return (cross_ratio * 0.5 + trust_factor * 0.5)
    
    @property
    def like_count(self) -> int:
        return len(self.likes)


class ChallengeStatus(Enum):
    PENDING_L1 = 'pending_l1'
    RESOLVED_L1 = 'resolved_l1'
    PENDING_L2 = 'pending_l2'
    RESOLVED_L2 = 'resolved_l2'
    PENDING_L3 = 'pending_l3'
    RESOLVED_L3 = 'resolved_l3'


class ChallengeVerdict(Enum):
    GUILTY = 'guilty'
    NOT_GUILTY = 'not_guilty'


@dataclass
class Challenge:
    """Represents a content challenge"""
    id: str
    content_id: str
    challenger_id: str
    author_id: str
    created_day: int
    
    status: ChallengeStatus = ChallengeStatus.PENDING_L1
    verdict: Optional[ChallengeVerdict] = None
    
    # Fees paid at each layer
    l1_fee: float = 0.0
    l2_fee: float = 0.0
    l3_fee: float = 0.0
    
    # Jury members (for L2/L3)
    jury_members: List[str] = field(default_factory=list)
    jury_votes: Dict[str, ChallengeVerdict] = field(default_factory=dict)
    
    # Settlement
    penalty_amount: float = 0.0
    challenger_reward: float = 0.0
    jury_reward: float = 0.0
    pool_contribution: float = 0.0


@dataclass
class Cabal:
    """Represents a coordinated manipulation group"""
    id: str
    member_ids: Set[str] = field(default_factory=set)
    detected: bool = False
    detection_day: Optional[int] = None
    
    def add_member(self, user_id: str):
        self.member_ids.add(user_id)
    
    @property
    def size(self) -> int:
        return len(self.member_ids)


@dataclass
class DailyMetrics:
    """Tracks daily platform metrics"""
    day: int
    
    # Activity
    active_users: int = 0
    posts_created: int = 0
    likes_given: int = 0
    comments_made: int = 0
    challenges_initiated: int = 0
    
    # Economics
    total_spent: float = 0.0
    total_earned: float = 0.0
    total_penalties: float = 0.0
    reward_pool: float = 0.0
    platform_emission: float = 0.0
    
    # Moderation
    violations_caught: int = 0
    false_challenges: int = 0
    
    # Trust distribution
    white_count: int = 0
    green_count: int = 0
    blue_count: int = 0
    purple_count: int = 0
    orange_count: int = 0


@dataclass
class SimulationState:
    """Holds the entire simulation state"""
    users: Dict[str, User] = field(default_factory=dict)
    content: Dict[str, Content] = field(default_factory=dict)
    challenges: Dict[str, Challenge] = field(default_factory=dict)
    cabals: Dict[str, Cabal] = field(default_factory=dict)
    
    daily_metrics: List[DailyMetrics] = field(default_factory=list)
    
    current_day: int = 0
    reward_pool: float = 0.0  # DEPRECATED: no longer used
    platform_revenue: float = 0.0  # NEW: platform's 50% cut
    spam_index: float = 0.0
    
    # Pending settlements (day -> list of content_ids)
    pending_settlements: Dict[int, List[str]] = field(default_factory=dict)
    
    # Content index by day for fast lookup
    content_by_day: Dict[int, List[str]] = field(default_factory=dict)
    
    # Cache for recent content
    _recent_content_cache: List[Content] = field(default_factory=list)
    _recent_content_cache_day: int = -1
    
    def add_user(self, user: User):
        self.users[user.id] = user
    
    def add_content(self, content: Content):
        self.content[content.id] = content
        # Index by day
        if content.created_day not in self.content_by_day:
            self.content_by_day[content.created_day] = []
        self.content_by_day[content.created_day].append(content.id)
        # Schedule settlement
        settle_day = content.created_day + 7
        if settle_day not in self.pending_settlements:
            self.pending_settlements[settle_day] = []
        self.pending_settlements[settle_day].append(content.id)
        # Invalidate cache
        self._recent_content_cache_day = -1
    
    def add_challenge(self, challenge: Challenge):
        self.challenges[challenge.id] = challenge
    
    def get_active_content(self) -> List[Content]:
        return [c for c in self.content.values() 
                if c.status == ContentStatus.ACTIVE]
    
    def get_content_by_day_range(self, start: int, end: int) -> List[Content]:
        """Optimized: use day index for fast lookup with better caching"""
        cache_key = (start, end)
        if hasattr(self, '_content_cache_key') and self._content_cache_key == cache_key:
            if hasattr(self, '_content_cache_result'):
                return self._content_cache_result
        
        result = []
        for day in range(max(0, start), end + 1):
            if day in self.content_by_day:
                for cid in self.content_by_day[day]:
                    c = self.content.get(cid)
                    if c and c.status == ContentStatus.ACTIVE:
                        result.append(c)
        
        self._content_cache_key = cache_key
        self._content_cache_result = result
        return result
