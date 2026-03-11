"""
Pricing service - simplified for minimal system.

In the minimal system:
- Posting is FREE
- Likes have dynamic pricing (see dynamic_like_service.py)
- Comments have fixed costs (20 sat comment, 10 sat reply)
"""

from app.models.post import PostType


# Content limits by type
CONTENT_LIMITS = {
    PostType.NOTE.value: {'min': 1, 'max': 500},
    PostType.ARTICLE.value: {'min': 100, 'max': 50000},
    PostType.QUESTION.value: {'min': 10, 'max': 2000},
}


def validate_content_length(content: str, post_type: str) -> tuple[bool, str | None]:
    """Validate content length against type-specific limits."""
    limits = CONTENT_LIMITS.get(post_type, CONTENT_LIMITS[PostType.NOTE.value])
    length = len(content)
    
    if length < limits['min']:
        return False, f'{post_type.title()} must be at least {limits["min"]} characters'
    
    if length > limits['max']:
        return False, f'{post_type.title()} cannot exceed {limits["max"]} characters'
    
    return True, None


def get_content_limits(post_type: str) -> dict:
    """Get min/max character limits for a post type."""
    return CONTENT_LIMITS.get(post_type, CONTENT_LIMITS[PostType.NOTE.value])
