"""
BitLink Economic Simulator - Configuration
All parameters from SIMULATION_PARAMS.md
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Tuple


# =============================================================================
# Global Constants
# =============================================================================

# Platform daily subsidy (fixed budget, not per-user emission)
# ~$100/day at 1 BTC = $100k → 100,000 sat/day
DAILY_PLATFORM_SUBSIDY = 100_000  # sat per day (fixed)
DAILY_EMISSION_PER_DAU = 0        # DEPRECATED: no per-user emission

REWARD_SETTLEMENT_DAYS = 7
CHALLENGE_WINDOW_DAYS = 7
AUTHOR_REWARD_RATIO = 0.80
COMMENT_POOL_RATIO = 0.20

# Reward pool split (reduces winner-take-all effect)
BASE_POOL_RATIO = 0.30      # 30% divided equally among all settled content
PERF_POOL_RATIO = 0.70      # 70% divided by adjusted_score

# Diminishing returns for popular content
DIMINISHING_RETURNS_ENABLED = True  # Apply log decay to high-like content
BOOST_TO_POOL_RATIO = 0.30
HUMAN_PLEDGE_BONUS = 1.20
HUMAN_PLEDGE_PENALTY_MULT = 2.00

# Daily free actions (no cost deducted)
DAILY_FREE_POSTS = 1
DAILY_FREE_COMMENTS = 5
DAILY_FREE_LIKES = 10

# Quality inference bonuses
COMMENT_BONUS_MAX = 0.5          # Max +50% for high comment count
COMMENT_BONUS_THRESHOLD = 10    # Comments needed for max bonus
AUTHOR_TRUST_BONUS_MAX = 0.3    # Max +30% for high trust author


# =============================================================================
# Action Costs (base values in sat)
# =============================================================================

C_POST = 200
C_QUESTION = 300
C_ANSWER = 200
C_COMMENT = 50
C_REPLY = 20
C_LIKE = 10
C_COMMENT_LIKE = 5

F_L1 = 100  # AI challenge
F_L2 = 500  # Community jury
F_L3 = 1500  # Committee


# =============================================================================
# Trust Score Tiers
# =============================================================================

class TrustTier(Enum):
    WHITE = 'white'
    GREEN = 'green'
    BLUE = 'blue'
    PURPLE = 'purple'
    ORANGE = 'orange'


TRUST_TIER_RANGES = {
    TrustTier.WHITE: (0, 150),         # 新手 (~72.5%)
    TrustTier.GREEN: (151, 200),       # 活跃用户 (~15%)
    TrustTier.BLUE: (201, 300),        # 优质贡献者 (~8%)
    TrustTier.PURPLE: (301, 450),      # 精英 (~3.5%)
    TrustTier.ORANGE: (451, 99999),    # 传奇 (~1%)
}

# 等级越高，信誉奖励递减（防止顶部固化，加速新人成长）
TIER_REWARD_MULTIPLIER = {
    TrustTier.WHITE: 1.0,      # 100% 奖励
    TrustTier.GREEN: 0.7,      # 70% 奖励
    TrustTier.BLUE: 0.5,       # 50% 奖励
    TrustTier.PURPLE: 0.3,     # 30% 奖励
    TrustTier.ORANGE: 0.15,    # 15% 奖励（大幅降低）
}


def get_trust_tier(trust_score: float) -> TrustTier:
    for tier, (low, high) in TRUST_TIER_RANGES.items():
        if low <= trust_score <= high:
            return tier
    return TrustTier.WHITE


# =============================================================================
# Discovery Score Weights
# =============================================================================

W_TRUST = {
    TrustTier.WHITE: 0.5,
    TrustTier.GREEN: 1.0,
    TrustTier.BLUE: 2.0,
    TrustTier.PURPLE: 3.5,
    TrustTier.ORANGE: 6.0,
}

# N_novelty based on past 30-day interaction count
N_NOVELTY = [
    (0, 1.00),      # First time
    (3, 0.60),      # 1-3 times
    (10, 0.30),     # 4-10 times
    (30, 0.12),     # 11-30 times
    (float('inf'), 0.05),  # 30+ times
]


def get_n_novelty(interaction_count: int) -> float:
    for threshold, value in N_NOVELTY:
        if interaction_count <= threshold:
            return value
    return 0.05


S_SOURCE = {
    'stranger': 1.00,
    'follower': 0.15,
}

# CE (Consensus Entropy) - OPTIMIZED v2
# Lower = less valuable (echo chamber), Higher = more valuable (diversity)
CE_ENTROPY = {
    'cabal_mutual': 0.02,           # REDUCED: 0.1 → 0.02 (almost worthless)
    'high_frequency_friend': 0.15,  # REDUCED: 0.2 → 0.15
    'same_channel': 1.0,
    'cross_channel': 5.0,
    'cross_region': 10.0,
}

# NEW: Audience Quality Factor parameters
AUDIENCE_QUALITY_THRESHOLD = 5  # Min likes before applying audience quality factor
AUDIENCE_QUALITY_WEIGHT = 0.5   # INCREASED: 0.3 → 0.5 for stronger effect

# NEW: Cabal detection and penalty parameters
CABAL_DETECTION_RISK_THRESHOLD = 80  # Risk score to trigger detection
CABAL_PENALTY_MULTIPLIER = 0.3       # Future actions weighted at 30%
CABAL_PENALTY_DURATION_DAYS = 30     # Penalty lasts 30 days
CABAL_DETECTION_RATIO = 3            # internal/external > 3 triggers detection
CABAL_ASSET_SEIZURE_BASE = 0.3       # Base seizure rate (30%)
CABAL_MAX_SEIZURE_RATE = 0.8         # Max seizure rate (80%)

# NEW: Gradual suspicion system (A3)
CABAL_SUSPICION_RATIO_THRESHOLD = 5  # ratio=5 means 100% suspicion
CABAL_SUSPICION_WEIGHT_PENALTY = 0.7 # Max 70% weight reduction at full suspicion
CABAL_VOLUME_THRESHOLD = 50          # Avg internal interactions per member for suspicion

# NEW: Circle contribution limit (anti-cabal mechanism)
CIRCLE_SIZE = 10                     # Top N interactors = your "circle"
DAILY_CIRCLE_CONTRIBUTION_LIMIT = 100  # Max DS weight you can contribute to circle per day

# NEW: Violation like penalty (only for clear violations)
VIOLATION_LIKE_PENALTY = -8  # INCREASED: -2 → -8 for stronger effect

# Scout multiplier based on like order (DISABLED - caused penalty for popular content)
SCOUT_MULTIPLIER = [
    (float('inf'), 1.0),  # All likes have equal weight
]


def get_scout_multiplier(like_order: int) -> float:
    return 1.0


# =============================================================================
# Influence Points (IP) for follower quality
# =============================================================================

IP_WEIGHTS = {
    TrustTier.WHITE: 1,
    TrustTier.GREEN: 10,
    TrustTier.BLUE: 50,
    TrustTier.PURPLE: 200,
    TrustTier.ORANGE: 1000,
}


# =============================================================================
# Reputation Change Events
# =============================================================================

@dataclass
class ReputationChange:
    dimension: str  # 'creator', 'curator', 'juror', 'risk'
    min_change: float
    max_change: float


REPUTATION_EVENTS = {
    # Creator - 基础提高（配合等级递减机制）
    'post_settled_no_violation': ReputationChange('creator', 8, 18),     # 提高基础
    'post_top_10_percent': ReputationChange('creator', 20, 40),          # 提高
    'post_top_1_percent': ReputationChange('creator', 50, 100),          # 提高
    'content_violation': ReputationChange('creator', -60, -20),          # 惩罚不递减
    'content_cleared': ReputationChange('creator', 10, 25),
    # Curator - 适度提高
    'liked_violation': ReputationChange('curator', -8, -2),              # 惩罚不递减
    'liked_top_10': ReputationChange('curator', 3, 8),
    'liked_top_1': ReputationChange('curator', 8, 16),
    'comment_top_3': ReputationChange('curator', 5, 12),
    # Juror - 保持适度
    'jury_correct': ReputationChange('juror', 5, 15),
    'jury_wrong': ReputationChange('juror', -15, -5),
    'jury_absent': ReputationChange('juror', -10, -10),
    'jury_overturned': ReputationChange('juror', -30, -10),
    # Risk - 高惩罚（不递减，永远全额惩罚）
    'anomaly_funds': ReputationChange('risk', 30, 150),
    'cabal_primary': ReputationChange('risk', 150, 500),
    'cabal_associate': ReputationChange('risk', 40, 150),
}


# =============================================================================
# Challenge Penalty Multipliers
# =============================================================================

PENALTY_MULTIPLIERS = {
    'low_quality': 0.5,
    'spam_ad': 1.0,
    'plagiarism_ai': 1.5,
    'scam_phishing': 2.0,
}

# Challenge result distribution
CHALLENGE_DISTRIBUTION = {
    'challenger_reward': 0.35,
    'jury_reward': 0.25,
    'pool_reward': 0.40,
}


# =============================================================================
# User Types and Behavior Profiles
# =============================================================================

class UserType(Enum):
    ELITE_CREATOR = 'elite_creator'
    ACTIVE_CREATOR = 'active_creator'
    CURATOR = 'curator'
    NORMAL = 'normal'
    LURKER = 'lurker'
    EXTREME_MARKETER = 'extreme_marketer'  # Clickbait/sensational
    AD_SPAMMER = 'ad_spammer'  # External links/ads
    LOW_QUALITY_CREATOR = 'low_quality_creator'
    TOXIC_CREATOR = 'toxic_creator'  # Extremist views
    STUPID_AUDIENCE = 'stupid_audience'  # Likes garbage
    MALICIOUS_CHALLENGER = 'malicious_challenger'  # False reports
    CABAL_MEMBER = 'cabal_member'  # Organized manipulation


@dataclass
class UserBehaviorProfile:
    """Defines behavioral probabilities for each user type"""
    daily_post_rate: float  # Average posts per day
    daily_like_rate: float  # Average likes per day
    daily_comment_rate: float  # Average comments per day
    content_quality: float  # 0.0 = garbage, 1.0 = excellent
    like_quality: float  # Probability of liking good content
    cross_circle_rate: float  # Rate of interacting outside their circle
    challenge_rate: float  # Rate of challenging content
    challenge_accuracy: float  # Accuracy of challenges (hit bad content)
    human_pledge_rate: float  # Rate of using human pledge
    violation_rate: float  # Rate of content being actual violation
    initial_balance: Tuple[int, int]  # (min, max) initial sat
    monthly_deposit_prob: float
    monthly_deposit_amount: Tuple[int, int]
    # NEW: Activity intensity (how many hours per day they spend)
    daily_activity_hours: float  # 0.5 = casual, 8.0 = full-time bot operator
    activity_consistency: float  # 0.0 = random, 1.0 = like clockwork (bots)


USER_PROFILES: Dict[UserType, UserBehaviorProfile] = {
    UserType.ELITE_CREATOR: UserBehaviorProfile(
        daily_post_rate=1.0,
        daily_like_rate=15,
        daily_comment_rate=8,
        content_quality=0.95,
        like_quality=0.90,
        cross_circle_rate=0.7,
        challenge_rate=0.02,        # 偶尔举报，但举报必中
        challenge_accuracy=0.90,    # 很准
        human_pledge_rate=0.9,
        violation_rate=0.02,
        initial_balance=(10000, 50000),
        monthly_deposit_prob=0.8,
        monthly_deposit_amount=(5000, 20000),
        daily_activity_hours=3.0,
        activity_consistency=0.5,
    ),
    UserType.ACTIVE_CREATOR: UserBehaviorProfile(
        daily_post_rate=1.5,
        daily_like_rate=15,
        daily_comment_rate=8,
        content_quality=0.70,
        like_quality=0.70,
        cross_circle_rate=0.4,
        challenge_rate=0.02,        # 偶尔举报
        challenge_accuracy=0.75,    # 较准
        human_pledge_rate=0.5,
        violation_rate=0.08,
        initial_balance=(5000, 15000),
        monthly_deposit_prob=0.6,
        monthly_deposit_amount=(2000, 10000),
        daily_activity_hours=3.0,
        activity_consistency=0.5,
    ),
    UserType.CURATOR: UserBehaviorProfile(
        daily_post_rate=0.1,         # 0.3 → 0.1 (基本不发帖)
        daily_like_rate=15,
        daily_comment_rate=6,
        content_quality=0.50,        # 0.70 → 0.50 (偶尔发也一般)
        like_quality=0.85,
        cross_circle_rate=0.6,
        challenge_rate=0.05,
        challenge_accuracy=0.85,
        human_pledge_rate=0.6,
        violation_rate=0.03,
        initial_balance=(3000, 10000),
        monthly_deposit_prob=0.5,
        monthly_deposit_amount=(1000, 5000),
        daily_activity_hours=4.0,
        activity_consistency=0.6,
    ),
    UserType.NORMAL: UserBehaviorProfile(
        daily_post_rate=0.2,
        daily_like_rate=3,
        daily_comment_rate=1,
        content_quality=0.50,
        like_quality=0.60,
        cross_circle_rate=0.3,
        challenge_rate=0.005,       # 极少举报（每200天1次）
        challenge_accuracy=0.60,    # 举报时还算准
        human_pledge_rate=0.2,
        violation_rate=0.10,
        initial_balance=(1000, 5000),
        monthly_deposit_prob=0.2,
        monthly_deposit_amount=(500, 2000),
        daily_activity_hours=0.5,
        activity_consistency=0.2,
    ),
    UserType.LURKER: UserBehaviorProfile(
        daily_post_rate=0.02,
        daily_like_rate=0.5,
        daily_comment_rate=0.1,
        content_quality=0.40,
        like_quality=0.50,
        cross_circle_rate=0.2,
        challenge_rate=0.001,       # 几乎不举报
        challenge_accuracy=0.50,
        human_pledge_rate=0.1,
        violation_rate=0.15,
        initial_balance=(500, 2000),
        monthly_deposit_prob=0.05,
        monthly_deposit_amount=(200, 1000),
        daily_activity_hours=0.2,
        activity_consistency=0.1,
    ),
    UserType.EXTREME_MARKETER: UserBehaviorProfile(
        daily_post_rate=5.0,
        daily_like_rate=2,
        daily_comment_rate=3,
        content_quality=0.20,
        like_quality=0.30,
        cross_circle_rate=0.1,
        challenge_rate=0.005,       # 不举报，忙着发内容
        challenge_accuracy=0.20,
        human_pledge_rate=0.1,
        violation_rate=0.40,
        initial_balance=(3000, 10000),
        monthly_deposit_prob=0.4,
        monthly_deposit_amount=(2000, 8000),
        daily_activity_hours=6.0,
        activity_consistency=0.8,
    ),
    UserType.AD_SPAMMER: UserBehaviorProfile(
        daily_post_rate=10.0,
        daily_like_rate=0,
        daily_comment_rate=5,
        content_quality=0.05,
        like_quality=0.10,
        cross_circle_rate=0.05,
        challenge_rate=0.0,         # 不举报
        challenge_accuracy=0.0,
        human_pledge_rate=0.0,
        violation_rate=0.85,
        initial_balance=(2000, 8000),
        monthly_deposit_prob=0.3,
        monthly_deposit_amount=(1000, 5000),
        daily_activity_hours=8.0,
        activity_consistency=0.95,
    ),
    UserType.LOW_QUALITY_CREATOR: UserBehaviorProfile(
        daily_post_rate=1.5,
        daily_like_rate=5,
        daily_comment_rate=3,
        content_quality=0.25,
        like_quality=0.40,
        cross_circle_rate=0.2,
        challenge_rate=0.01,        # 很少举报
        challenge_accuracy=0.30,
        human_pledge_rate=0.3,
        violation_rate=0.25,
        initial_balance=(1000, 5000),
        monthly_deposit_prob=0.25,
        monthly_deposit_amount=(500, 3000),
        daily_activity_hours=2.0,
        activity_consistency=0.4,
    ),
    UserType.TOXIC_CREATOR: UserBehaviorProfile(
        daily_post_rate=3.0,
        daily_like_rate=3,
        daily_comment_rate=8,
        content_quality=0.15,
        like_quality=0.20,
        cross_circle_rate=0.05,
        challenge_rate=0.05,        # 0.30 → 0.05 (偶尔恶意举报)
        challenge_accuracy=0.15,
        human_pledge_rate=0.4,
        violation_rate=0.50,
        initial_balance=(2000, 8000),
        monthly_deposit_prob=0.35,
        monthly_deposit_amount=(1000, 5000),
        daily_activity_hours=5.0,
        activity_consistency=0.7,
    ),
    UserType.STUPID_AUDIENCE: UserBehaviorProfile(
        daily_post_rate=0.05,
        daily_like_rate=4,           # 10 → 4 (偶尔被骗点赞)
        daily_comment_rate=2,
        content_quality=0.30,
        like_quality=0.25,
        cross_circle_rate=0.15,
        challenge_rate=0.002,
        challenge_accuracy=0.20,
        human_pledge_rate=0.05,
        violation_rate=0.20,
        initial_balance=(500, 3000),
        monthly_deposit_prob=0.15,
        monthly_deposit_amount=(300, 1500),
        daily_activity_hours=2.0,
        activity_consistency=0.3,
    ),
    UserType.MALICIOUS_CHALLENGER: UserBehaviorProfile(
        daily_post_rate=0.3,
        daily_like_rate=2,
        daily_comment_rate=1,
        content_quality=0.40,
        like_quality=0.40,
        cross_circle_rate=0.3,
        challenge_rate=0.90,        # 极高！这是他们的主业
        challenge_accuracy=0.08,    # 极不准，纯恶意
        human_pledge_rate=0.2,
        violation_rate=0.15,
        initial_balance=(3000, 10000),
        monthly_deposit_prob=0.4,
        monthly_deposit_amount=(1000, 5000),
        daily_activity_hours=4.0,
        activity_consistency=0.6,
    ),
    UserType.CABAL_MEMBER: UserBehaviorProfile(
        daily_post_rate=3.0,
        daily_like_rate=35,          # 80 → 35 (更现实的刷量)
        daily_comment_rate=15,
        content_quality=0.35,
        like_quality=0.10,
        cross_circle_rate=0.02,
        challenge_rate=0.02,
        challenge_accuracy=0.30,
        human_pledge_rate=0.3,
        violation_rate=0.35,
        initial_balance=(5000, 15000),
        monthly_deposit_prob=0.5,
        monthly_deposit_amount=(2000, 10000),
        daily_activity_hours=6.0,
        activity_consistency=0.9,
    ),
}


# =============================================================================
# User Type Distribution (total = 100%)
# =============================================================================

USER_TYPE_DISTRIBUTION = {
    UserType.ELITE_CREATOR: 0.005,       # 0.5% - 顶级 KOL
    UserType.ACTIVE_CREATOR: 0.03,       # 3% - 定期发帖的活跃创作者
    UserType.CURATOR: 0.03,              # 3% - 主动点赞评论 (6% → 3%)
    UserType.NORMAL: 0.25,               # 25% - 偶尔互动的普通人 (补上3%)
    UserType.LURKER: 0.55,               # 55% - 沉默的大多数
    UserType.EXTREME_MARKETER: 0.02,     # 2% - 博眼球/标题党
    UserType.AD_SPAMMER: 0.01,           # 1% - 广告引流
    UserType.LOW_QUALITY_CREATOR: 0.03,  # 3% - 想创作但水平不行
    UserType.TOXIC_CREATOR: 0.01,        # 1% - 极端/恶意内容
    UserType.STUPID_AUDIENCE: 0.05,      # 5% - 容易被垃圾吸引
    UserType.MALICIOUS_CHALLENGER: 0.005, # 0.5% - 恶意举报
    UserType.CABAL_MEMBER: 0.01,         # 1% - 有组织刷量
}

# Verify distribution sums to 1
assert abs(sum(USER_TYPE_DISTRIBUTION.values()) - 1.0) < 0.001, \
    f"Distribution sums to {sum(USER_TYPE_DISTRIBUTION.values())}, expected 1.0"


# =============================================================================
# Simulation Parameters
# =============================================================================

SIMULATION_SCALE = 1000  # Total users
SIMULATION_DAYS = 120  # 4 months
CABAL_GROUP_SIZE = 5  # Members per cabal group

# Individual variation factor (each user varies ±30% from type baseline)
INDIVIDUAL_VARIATION = 0.3

# Content quality thresholds for categorization
QUALITY_THRESHOLDS = {
    'top_1_percent': 0.99,
    'top_10_percent': 0.90,
    'average': 0.50,
    'low': 0.25,
    'garbage': 0.10,
}

# Withdrawal limits by trust tier
WITHDRAWAL_LIMITS = {
    TrustTier.WHITE: (50000, 72),   # (daily_limit_sat, delay_hours)
    TrustTier.GREEN: (150000, 24),
    TrustTier.BLUE: (300000, 12),
    TrustTier.PURPLE: (1000000, 6),
    TrustTier.ORANGE: (2000000, 1),
}
