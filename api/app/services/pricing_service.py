"""
Pricing service for post costs with prime-based length decay.

The pricing model uses prime number intervals to create a non-linear
decay in per-character cost as content length increases.

Formula: total_cost = base_cost × K(trust) + length_cost

Where:
- base_cost: Fixed fee per type (Note: 50, Article: 80, Question: 100)
- K(trust): Trust-based fee multiplier (0.6 - 1.4)
- length_cost: Prime interval decay-based cost for articles
"""

from app.models.post import PostType
from app.services.trust_service import dynamic_fee_multiplier

# Base costs by post type (before K(trust) multiplier)
BASE_COSTS = {
    PostType.NOTE.value: 50,
    PostType.ARTICLE.value: 80,
    PostType.QUESTION.value: 100,
}

# Prime-based thresholds for length pricing (in characters)
# Each tuple: (threshold_chars, rate_per_100_chars)
# Thresholds are prime × 100 to create natural decay intervals
PRIME_LENGTH_TIERS = [
    (200, 10),     # 0-200 chars (prime 2): 10 sat per 100 chars
    (500, 8),      # 200-500 chars (prime 5): 8 sat per 100 chars
    (1100, 5),     # 500-1100 chars (prime 11): 5 sat per 100 chars
    (2300, 3),     # 1100-2300 chars (prime 23): 3 sat per 100 chars
    (4700, 2),     # 2300-4700 chars (prime 47): 2 sat per 100 chars
    (float('inf'), 1),  # 4700+ chars (prime 97+): 1 sat per 100 chars
]

# Content limits by type
CONTENT_LIMITS = {
    PostType.NOTE.value: {'min': 1, 'max': 500},
    PostType.ARTICLE.value: {'min': 100, 'max': 50000},
    PostType.QUESTION.value: {'min': 10, 'max': 2000},
}


def calculate_length_cost(content: str, post_type: str) -> int:
    """
    Calculate length-based cost using prime interval decay.
    
    Only applies to articles - notes and questions have flat fees.
    
    Args:
        content: The post content text
        post_type: Type of post ('note', 'article', 'question')
        
    Returns:
        Length-based cost in sats (0 for non-articles)
    """
    if post_type != PostType.ARTICLE.value:
        return 0
    
    length = len(content)
    cost = 0.0
    prev_threshold = 0
    
    for threshold, rate in PRIME_LENGTH_TIERS:
        if length <= prev_threshold:
            break
        segment_chars = min(length, threshold) - prev_threshold
        if segment_chars > 0:
            cost += (segment_chars / 100.0) * rate
        prev_threshold = threshold
    
    return max(0, int(round(cost)))


def calculate_base_cost(post_type: str, trust_score: int = 135) -> int:
    """
    Calculate base cost with K(trust) multiplier applied.
    
    Args:
        post_type: Type of post ('note', 'article', 'question')
        trust_score: Author's trust score (default 135 for new users)
        
    Returns:
        Base cost in sats with trust multiplier applied
    """
    raw_cost = BASE_COSTS.get(post_type, BASE_COSTS[PostType.NOTE.value])
    k = dynamic_fee_multiplier(trust_score)
    return max(1, int(round(raw_cost * k)))


def calculate_total_post_cost(
    content: str,
    post_type: str,
    trust_score: int = 135,
    bounty: int = 0,
    is_free_post: bool = False,
) -> dict:
    """
    Calculate total cost for creating a post.
    
    Args:
        content: The post content text
        post_type: Type of post ('note', 'article', 'question')
        trust_score: Author's trust score
        bounty: Optional bounty amount (for questions)
        is_free_post: Whether this is a free post (waives base fee only)
        
    Returns:
        Dict with cost breakdown:
        {
            'base_cost': int,      # Base fee (after K multiplier)
            'length_cost': int,    # Length-based fee (articles only)
            'bounty': int,         # Bounty amount
            'fee_paid': int,       # Total fee (base + length, 0 if free)
            'total': int,          # Total cost (fee_paid + bounty)
        }
    """
    base_cost = calculate_base_cost(post_type, trust_score)
    length_cost = calculate_length_cost(content, post_type)
    
    fee = base_cost + length_cost
    fee_paid = 0 if is_free_post else fee
    
    return {
        'base_cost': base_cost,
        'length_cost': length_cost,
        'bounty': bounty,
        'fee_paid': fee_paid,
        'total': fee_paid + bounty,
    }


def estimate_article_cost(content_length: int, trust_score: int = 135) -> dict:
    """
    Estimate cost for an article based on character count.
    
    Useful for live cost preview in the UI.
    
    Args:
        content_length: Number of characters
        trust_score: Author's trust score
        
    Returns:
        Dict with estimated cost breakdown
    """
    dummy_content = 'x' * content_length
    return calculate_total_post_cost(
        content=dummy_content,
        post_type=PostType.ARTICLE.value,
        trust_score=trust_score,
    )


def validate_content_length(content: str, post_type: str) -> tuple[bool, str | None]:
    """
    Validate content length against type-specific limits.
    
    Args:
        content: The post content text
        post_type: Type of post
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    limits = CONTENT_LIMITS.get(post_type, CONTENT_LIMITS[PostType.NOTE.value])
    length = len(content)
    
    if length < limits['min']:
        return False, f"{post_type.title()} must be at least {limits['min']} characters"
    
    if length > limits['max']:
        return False, f"{post_type.title()} cannot exceed {limits['max']} characters"
    
    return True, None


def get_content_limits(post_type: str) -> dict:
    """Get min/max character limits for a post type."""
    return CONTENT_LIMITS.get(post_type, CONTENT_LIMITS[PostType.NOTE.value])
