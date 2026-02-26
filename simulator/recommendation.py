"""
BitLink Recommendation System
Handles content exposure, quality inference, and time decay
"""

import math
from typing import List, Dict, Optional, TYPE_CHECKING
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
    
    exposure_weight = inferred_quality × time_decay × author_multiplier
    """
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
