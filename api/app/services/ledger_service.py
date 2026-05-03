"""Slim ledger service for the non-custodial tipping model.

The platform never moves money. This module just records denormalized events
into the `ledger` table for the user's Transactions view. Authoritative balance
lives on-chain (Base USDC).
"""
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import Ledger, ActionType, RefType


class LedgerService:
    """Append-only event log. No balance arithmetic."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def record(
        self,
        user_id: int,
        amount_usdc_micro: int,
        action_type: ActionType,
        ref_type: RefType = RefType.NONE,
        ref_id: int | None = None,
        tx_hash: str | None = None,
        note: str | None = None,
    ) -> Ledger:
        """Append a ledger entry. amount_usdc_micro is signed (+ in, - out).
        For non-monetary events (FREE_POST_USED), pass amount=0."""
        entry = Ledger(
            user_id=user_id,
            amount_usdc_micro=amount_usdc_micro,
            action_type=action_type.value,
            ref_type=ref_type.value,
            ref_id=ref_id,
            tx_hash=tx_hash,
            note=note,
        )
        self.db.add(entry)
        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def get_history(
        self,
        user_id: int,
        limit: int = 50,
        offset: int = 0,
        action_type: str | None = None,
    ) -> list[Ledger]:
        """Get ledger entries for a user, newest first."""
        query = (
            select(Ledger)
            .where(Ledger.user_id == user_id)
            .order_by(desc(Ledger.created_at))
        )
        if action_type:
            query = query.where(Ledger.action_type == action_type)
        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())
