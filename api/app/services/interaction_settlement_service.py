"""
Interaction Settlement Service

Handles the 24h lock settlement mechanism for likes and comments.
- Settles expired PENDING interactions (status -> SETTLED)
- Called periodically by the settlement worker
"""
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.post import PostLike, CommentLike, Comment, InteractionStatus
from app.models.ledger import RefType
from app.services.ledger_service import LedgerService


class InteractionSettlementService:
    """Settles locked interactions after 24h expiry."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.ledger = LedgerService(db)

    async def settle_expired_post_likes(self) -> dict:
        """Settle all expired pending post likes."""
        now = datetime.utcnow()
        result = await self.db.execute(
            select(PostLike).where(
                PostLike.status == InteractionStatus.PENDING.value,
                PostLike.locked_until <= now
            )
        )
        likes = result.scalars().all()

        settled_count = 0
        total_amount = 0

        for like in likes:
            if like.cost_paid > 0 and like.recipient_id:
                await self.ledger.settle_locked(
                    amount=like.cost_paid,
                    recipient_id=like.recipient_id,
                    ref_type=RefType.POST_LIKE,
                    ref_id=like.id,
                    revenue_source='like',
                )
            like.status = InteractionStatus.SETTLED.value
            settled_count += 1
            total_amount += like.cost_paid

        return {'settled': settled_count, 'total_sats': total_amount}

    async def settle_expired_comment_likes(self) -> dict:
        """Settle all expired pending comment likes."""
        now = datetime.utcnow()
        result = await self.db.execute(
            select(CommentLike).where(
                CommentLike.status == InteractionStatus.PENDING.value,
                CommentLike.locked_until <= now
            )
        )
        likes = result.scalars().all()

        settled_count = 0
        total_amount = 0

        for like in likes:
            if like.cost_paid > 0 and like.recipient_id:
                await self.ledger.settle_locked(
                    amount=like.cost_paid,
                    recipient_id=like.recipient_id,
                    ref_type=RefType.COMMENT_LIKE,
                    ref_id=like.id,
                    revenue_source='like',
                )
            like.status = InteractionStatus.SETTLED.value
            settled_count += 1
            total_amount += like.cost_paid

        return {'settled': settled_count, 'total_sats': total_amount}

    async def settle_expired_comments(self) -> dict:
        """Settle all expired pending comments."""
        now = datetime.utcnow()
        result = await self.db.execute(
            select(Comment).where(
                Comment.interaction_status == InteractionStatus.PENDING.value,
                Comment.locked_until <= now
            )
        )
        comments = result.scalars().all()

        settled_count = 0
        total_amount = 0

        for comment in comments:
            if comment.cost_paid > 0 and comment.recipient_id:
                await self.ledger.settle_locked(
                    amount=comment.cost_paid,
                    recipient_id=comment.recipient_id,
                    ref_type=RefType.COMMENT,
                    ref_id=comment.id,
                    revenue_source='comment',
                )
            comment.interaction_status = InteractionStatus.SETTLED.value
            settled_count += 1
            total_amount += comment.cost_paid

        return {'settled': settled_count, 'total_sats': total_amount}

    async def settle_all_expired(self) -> dict:
        """Settle all expired pending interactions."""
        post_likes = await self.settle_expired_post_likes()
        comment_likes = await self.settle_expired_comment_likes()
        comments = await self.settle_expired_comments()

        return {
            'post_likes': post_likes,
            'comment_likes': comment_likes,
            'comments': comments,
            'total_settled': (
                post_likes['settled'] +
                comment_likes['settled'] +
                comments['settled']
            ),
        }


async def run_interaction_settlement(db: AsyncSession) -> dict:
    """Convenience function for scheduler."""
    service = InteractionSettlementService(db)
    return await service.settle_all_expired()
