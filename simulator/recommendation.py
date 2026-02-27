"""
BitLink Recommendation System
Handles content exposure, quality inference, time decay, and quality-based subsidies
"""

import math
from typing import List, Dict, Optional, Tuple, TYPE_CHECKING
from dataclasses import dataclass

if TYPE_CHECKING:
    from models import Content, User, SimulationState


# =============================================================================
# Configuration
# =============================================================================

# Time decay parameters
BASE_HALF_LIFE_DAYS = 3.0       # Base half-life for content exposure
QUALITY_HALF_LIFE_BONUS = 4.0   # Max bonus days for high quality content
ENGAGEMENT_HALF_LIFE_BONUS = 4.0  # Max bonus days for high engagement

# Quality density subsidy parameters
QUALITY_DENSITY_SUBSIDY_RATIO = 0.10  # 10% of platform revenue for underrated content
MIN_LIKES_FOR_DENSITY = 2             # Lowered: need at least 2 likes
DENSITY_THRESHOLD = 0.35              # Lowered: allow more mid-quality content
LOW_EXPOSURE_PERCENTILE = 0.7         # Expanded: bottom 70% by likes count

# Inferred quality weights
WEIGHT_ENGAGEMENT = 0.35
WEIGHT_SOURCE_QUALITY = 0.35
WEIGHT_AUTHOR = 0.20
WEIGHT_NEGATIVE = 0.10

# Engagement thresholds
LIKES_PER_DAY_MAX = 5.0  # 5 likes/day = max engagement score
MIN_LIKES_FOR_SOURCE_QUALITY = 3  # Need at least 3 likes to assess source quality

# Author trust multiplier range
AUTHOR_TRUST_MULT_MIN = 0.8
AUTHOR_TRUST_MULT_MAX = 1.5


# =============================================================================
# Quality Inference (Observable Signals Only)
# =============================================================================

def get_inferred_quality(content: 'Content', state: 'SimulationState', current_day: int) -> float:
    """
    Infer content quality from observable signals.
    This is what a real system would use (no god's-eye view).
    
    Returns: float between 0.0 and 1.0
    """
    likes = content.likes
    author = state.users.get(content.author_id)
    age_days = max(0, current_day - content.created_day)
    
    # No likes yet - conservative estimate based on author
    # New content gets a small initial boost to collect signals
    if not likes:
        if author:
            # New content: base 0.3 + small author bonus (max 0.2)
            # This prevents high-trust accounts from dominating fresh content
            author_bonus = min(0.2, author.trust_score / 2000)
            return 0.3 + author_bonus
        return 0.3
    
    # 1. Engagement signal (like density over time)
    age_days = max(1, current_day - content.created_day)
    like_density = len(likes) / age_days
    engagement_signal = min(1.0, like_density / LIKES_PER_DAY_MAX)
    
    # Comment bonus
    comment_count = len(content.comments) if hasattr(content, 'comments') else 0
    comment_ratio = min(1.0, comment_count / max(1, len(likes)))
    engagement_signal = engagement_signal * 0.7 + comment_ratio * 0.3
    
    # 2. Source quality signal (who is liking)
    if len(likes) >= MIN_LIKES_FOR_SOURCE_QUALITY:
        avg_liker_trust = sum(l.liker_trust_score for l in likes) / len(likes)
        cross_circle_count = sum(1 for l in likes if l.cross_circle_mult > 1.0)
        cross_ratio = cross_circle_count / len(likes)
        
        source_quality = (avg_liker_trust / 1000) * 0.6 + cross_ratio * 0.4
    else:
        source_quality = 0.5  # Not enough data, use neutral
    
    # 3. Author signal
    author_signal = author.trust_score / 1000 if author else 0.3
    
    # 4. Negative signals
    is_challenged = content.status.value == 'challenged'
    negative_penalty = 0.5 if is_challenged else 0.0
    
    # Low trust like ratio (potential manipulation)
    low_trust_likes = sum(1 for l in likes if l.liker_trust_score < 200)
    low_trust_ratio = low_trust_likes / len(likes) if likes else 0
    negative_penalty += low_trust_ratio * 0.3
    
    # Author risk penalty (cabal members, violators)
    if author and author.reputation.risk > 50:
        risk_penalty = min(0.5, author.reputation.risk / 200)
        negative_penalty += risk_penalty
    
    negative_signal = max(0, 1.0 - negative_penalty)
    
    # Combine signals
    inferred = (
        engagement_signal * WEIGHT_ENGAGEMENT +
        source_quality * WEIGHT_SOURCE_QUALITY +
        author_signal * WEIGHT_AUTHOR +
        negative_signal * WEIGHT_NEGATIVE
    )
    
    return min(1.0, max(0.0, inferred))


# =============================================================================
# Time Decay
# =============================================================================

def get_time_decay(content: 'Content', state: 'SimulationState', current_day: int) -> float:
    """
    Calculate time decay factor for content.
    High quality content decays slower.
    
    Returns: float between 0.0 and 1.0
    """
    age_days = current_day - content.created_day
    
    if age_days <= 0:
        return 1.0  # Fresh content, no decay
    
    # Dynamic half-life based on quality and engagement
    inferred_quality = get_inferred_quality(content, state, current_day)
    
    # Quality bonus: high quality content stays relevant longer
    quality_bonus = inferred_quality * QUALITY_HALF_LIFE_BONUS
    
    # Engagement bonus: popular content stays relevant longer
    like_count = len(content.likes)
    engagement_bonus = min(ENGAGEMENT_HALF_LIFE_BONUS, math.log(like_count + 1))
    
    half_life = BASE_HALF_LIFE_DAYS + quality_bonus + engagement_bonus
    
    # Exponential decay
    decay = math.exp(-age_days * math.log(2) / half_life)
    
    return decay


# =============================================================================
# Exposure Weight (for Recommendation)
# =============================================================================

def get_exposure_weight(content: 'Content', state: 'SimulationState', current_day: int) -> float:
    """
    Calculate content exposure weight for recommendation.
    This determines how likely content is to be shown to users.
    
    exposure_weight = inferred_quality × time_decay × author_multiplier + boost_bonus
    """
    from config import BOOST_MAX_MULTIPLIER
    
    # Base: inferred quality
    inferred_quality = get_inferred_quality(content, state, current_day)
    
    # Time decay
    decay = get_time_decay(content, state, current_day)
    
    # Author trust multiplier
    author = state.users.get(content.author_id)
    if author:
        # Map trust 0-1000 to multiplier 0.8-1.5
        trust_ratio = min(1.0, author.trust_score / 1000)  # Cap at 1.0
        author_mult = AUTHOR_TRUST_MULT_MIN + (AUTHOR_TRUST_MULT_MAX - AUTHOR_TRUST_MULT_MIN) * trust_ratio
        
        # CRITICAL: Penalize authors who are flagged as cabal members
        if hasattr(author, 'is_cabal_penalized') and author.is_cabal_penalized:
            author_mult *= 0.2  # 80% exposure penalty for known manipulators
    else:
        author_mult = 1.0
    
    exposure = inferred_quality * decay * author_mult
    
    # Post Boost: 花钱买曝光 (additive bonus, capped)
    boost_remaining = getattr(content, 'boost_remaining', 0)
    if boost_remaining > 0:
        # boost_remaining is in "discovery points", add to exposure
        # Cap the multiplier to avoid paid content dominating
        boost_mult = min(BOOST_MAX_MULTIPLIER, 1.0 + boost_remaining)
        exposure *= boost_mult
    
    return max(0.01, exposure)  # Minimum floor to avoid zero


# =============================================================================
# Discovery Score (for Economic Rewards)
# =============================================================================

def calculate_discovery_score(content: 'Content', state: 'SimulationState', current_day: int) -> float:
    """
    Calculate discovery score for economic reward distribution.
    Based on inferred quality and engagement metrics.
    
    Unlike exposure_weight (for recommendation), this is used for rewards.
    """
    likes = content.likes
    if not likes:
        return 0.0
    
    # Base: sum of weighted likes
    base_score = sum(like.weight for like in likes)
    
    # Apply inferred quality as multiplier
    inferred_quality = get_inferred_quality(content, state, current_day)
    
    # Diminishing returns for very popular content
    n = len(likes)
    if n > 1:
        diminishing = math.log(n + 1) / n
    else:
        diminishing = 1.0
    
    return base_score * inferred_quality * diminishing


# =============================================================================
# Content Sampling for Feed
# =============================================================================

def sample_content_for_feed(
    content_list: List['Content'],
    state: 'SimulationState',
    current_day: int,
    k: int,
    user: Optional['User'] = None
) -> List['Content']:
    """
    Sample content for a user's feed, weighted by exposure.
    
    Args:
        content_list: Available content to sample from
        state: Simulation state
        current_day: Current simulation day
        k: Number of items to sample
        user: Optional user for personalization (future use)
    
    Returns:
        List of sampled content
    """
    import random
    
    n = len(content_list)
    if n == 0:
        return []
    if n <= k:
        return content_list
    
    # For large lists, pre-filter to top candidates
    if n > 100:
        # Random pre-sample to reduce computation
        pre_sample = random.sample(content_list, min(k * 5, n))
        content_list = pre_sample
    
    # Calculate exposure weights
    weights = [get_exposure_weight(c, state, current_day) for c in content_list]
    
    # Weighted random sampling
    return random.choices(content_list, weights=weights, k=k)


# =============================================================================
# Validation Utilities (for debugging/analysis)
# =============================================================================

def validate_quality_inference(content: 'Content', state: 'SimulationState', current_day: int) -> Dict:
    """
    Compare inferred quality with true quality (god's eye view).
    Only for simulation analysis, not for production use.
    """
    true_quality = content.quality
    inferred_quality = get_inferred_quality(content, state, current_day)
    
    return {
        'content_id': content.id,
        'true_quality': true_quality,
        'inferred_quality': inferred_quality,
        'error': abs(true_quality - inferred_quality),
        'like_count': len(content.likes),
        'age_days': current_day - content.created_day,
    }


def analyze_inference_accuracy(state: 'SimulationState', current_day: int, sample_size: int = 1000) -> Dict:
    """
    Analyze how well inferred quality matches true quality across content.
    """
    import random
    import statistics
    
    content_list = list(state.content.values())
    if len(content_list) > sample_size:
        content_list = random.sample(content_list, sample_size)
    
    validations = [validate_quality_inference(c, state, current_day) for c in content_list]
    
    errors = [v['error'] for v in validations]
    
    # Correlation between true and inferred
    true_vals = [v['true_quality'] for v in validations]
    inferred_vals = [v['inferred_quality'] for v in validations]
    
    # Simple correlation calculation
    if len(true_vals) > 1:
        mean_true = statistics.mean(true_vals)
        mean_inferred = statistics.mean(inferred_vals)
        
        numerator = sum((t - mean_true) * (i - mean_inferred) for t, i in zip(true_vals, inferred_vals))
        denom_true = math.sqrt(sum((t - mean_true) ** 2 for t in true_vals))
        denom_inferred = math.sqrt(sum((i - mean_inferred) ** 2 for i in inferred_vals))
        
        if denom_true > 0 and denom_inferred > 0:
            correlation = numerator / (denom_true * denom_inferred)
        else:
            correlation = 0
    else:
        correlation = 0
    
    return {
        'sample_size': len(validations),
        'mean_error': statistics.mean(errors),
        'median_error': statistics.median(errors),
        'max_error': max(errors),
        'correlation': correlation,
    }


# =============================================================================
# Quality Density Subsidy System
# =============================================================================

def calculate_quality_density(content: 'Content', state: 'SimulationState') -> float:
    """
    Calculate quality density for a single post based on OBSERVABLE signals only.
    
    Quality Density = how "good" each like is, regardless of total like count.
    High density + low likes = underrated content that deserves subsidy.
    
    Returns: float between 0.0 and 1.0+
    """
    likes = content.likes
    
    if len(likes) < MIN_LIKES_FOR_DENSITY:
        return 0.0  # Not enough data to evaluate
    
    # 1. Liker Trust Score (are high-trust users liking this?)
    avg_liker_trust = sum(l.liker_trust_score for l in likes) / len(likes)
    trust_signal = min(1.0, avg_liker_trust / 500)  # 500 trust = 1.0
    
    # 2. Cross-circle ratio (are strangers liking this, not just friends?)
    cross_circle_count = sum(1 for l in likes if l.cross_circle_mult > 1.0)
    cross_ratio = cross_circle_count / len(likes)
    
    # 3. Comment density (does this content spark discussion?)
    comment_count = len(content.comments) if hasattr(content, 'comments') else 0
    comment_ratio = min(1.0, comment_count / max(1, len(likes)))
    
    # 4. Liker diversity (are likes from many different people, not a small group?)
    unique_likers = len(set(l.user_id for l in likes))
    diversity_ratio = unique_likers / len(likes)  # 1.0 if all unique
    
    # 5. Author newness bonus (new authors with quality signals deserve boost)
    author = state.users.get(content.author_id)
    if author and author.account_age <= 30:
        newbie_bonus = 0.2
    else:
        newbie_bonus = 0.0
    
    # Combine signals
    quality_density = (
        trust_signal * 0.35 +      # Who likes matters most
        cross_ratio * 0.25 +       # Strangers > friends
        comment_ratio * 0.15 +     # Discussion is good
        diversity_ratio * 0.15 +   # Many people > few people
        newbie_bonus * 0.10        # Help new creators
    )
    
    return quality_density


def identify_underrated_content(
    state: 'SimulationState',
    current_day: int,
    lookback_days: int = 7
) -> List[Tuple['Content', float]]:
    """
    Find content that has high quality density but low total likes.
    These are the "hidden gems" that deserve subsidy.
    
    Returns: List of (content, quality_density) tuples
    """
    import statistics
    
    # Get recent content
    recent_content = []
    for content in state.content.values():
        age = current_day - content.created_day
        if 0 < age <= lookback_days and len(content.likes) >= MIN_LIKES_FOR_DENSITY:
            recent_content.append(content)
    
    if not recent_content:
        return []
    
    # Calculate median likes (to define "low exposure")
    like_counts = [len(c.likes) for c in recent_content]
    median_likes = statistics.median(like_counts)
    
    # Find underrated content
    underrated = []
    for content in recent_content:
        # Must be below median likes (low exposure)
        if len(content.likes) > median_likes:
            continue
        
        # Exclude content from high-risk authors (cabal members, penalized users)
        author = state.users.get(content.author_id)
        if author:
            # Skip if author has high Risk score
            if author.reputation.risk > 100:
                continue
            # Skip if author is flagged as cabal member
            if author.cabal_id is not None or author.is_cabal_penalized:
                continue
        
        # Calculate quality density
        density = calculate_quality_density(content, state)
        
        # Must exceed threshold
        if density >= DENSITY_THRESHOLD:
            underrated.append((content, density))
    
    # Sort by density (highest first)
    underrated.sort(key=lambda x: -x[1])
    
    return underrated


def distribute_quality_subsidy(
    state: 'SimulationState',
    subsidy_pool: float,
    current_day: int
) -> Dict:
    """
    Distribute subsidy to underrated high-quality content.
    
    Args:
        state: Simulation state
        subsidy_pool: Amount available for subsidies (already calculated by caller)
        current_day: Current day
    
    Returns:
        Dict with subsidy statistics
    """
    
    if subsidy_pool <= 0:
        return {'pool': 0, 'recipients': 0, 'total_distributed': 0}
    
    # Find underrated content
    underrated = identify_underrated_content(state, current_day)
    
    if not underrated:
        return {'pool': subsidy_pool, 'recipients': 0, 'total_distributed': 0}
    
    # Calculate total density for proportional distribution
    total_density = sum(density for _, density in underrated)
    
    # Sort by density to find top 10%
    underrated_sorted = sorted(underrated, key=lambda x: -x[1])
    top_10_pct_cutoff = len(underrated_sorted) // 10 if len(underrated_sorted) >= 10 else 1
    top_10_pct_ids = {c.id for c, _ in underrated_sorted[:top_10_pct_cutoff]}
    
    # Import for reputation events
    import random
    from config import REPUTATION_EVENTS, TIER_REWARD_MULTIPLIER
    
    # Distribute subsidies
    total_distributed = 0
    recipients = 0
    
    for content, density in underrated:
        author = state.users.get(content.author_id)
        if not author:
            continue
        
        # Proportional share based on density
        share = density / total_density
        subsidy = subsidy_pool * share
        
        author.earn(subsidy)
        content.reward_earned += subsidy
        total_distributed += subsidy
        recipients += 1
        
        # 声誉奖励：收到补贴 = Creator 分数增加
        tier_mult = TIER_REWARD_MULTIPLIER.get(author.trust_tier, 1.0)
        event = REPUTATION_EVENTS.get('subsidy_received')
        if event:
            change = random.uniform(event.min_change, event.max_change)
            author.reputation.apply_change(event.dimension, change, tier_mult)
        
        # 额外奖励：质量密度前 10%
        if content.id in top_10_pct_ids:
            event = REPUTATION_EVENTS.get('top_quality_density')
            if event:
                change = random.uniform(event.min_change, event.max_change)
                author.reputation.apply_change(event.dimension, change, tier_mult)
    
    return {
        'pool': subsidy_pool,
        'recipients': recipients,
        'total_distributed': total_distributed,
        'avg_per_content': total_distributed / recipients if recipients > 0 else 0,
    }
