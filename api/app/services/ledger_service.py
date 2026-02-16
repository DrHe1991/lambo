from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.ledger import Ledger, ActionType, RefType


class InsufficientBalance(Exception):
    """Raised when user doesn't have enough sat."""
    pass


class LedgerService:
    """Handles all sat balance operations. Every movement goes through here."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def spend(
        self,
        user_id: int,
        amount: int,
        action_type: ActionType,
        ref_type: RefType = RefType.NONE,
        ref_id: int | None = None,
        note: str | None = None,
    ) -> Ledger:
        """Deduct sat from user balance. Raises InsufficientBalance if not enough."""
        if amount <= 0:
            raise ValueError('Spend amount must be positive')

        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        if user.available_balance < amount:
            raise InsufficientBalance(
                f'Need {amount} sat but only have {user.available_balance}'
            )

        user.available_balance -= amount

        entry = Ledger(
            user_id=user_id,
            amount=-amount,
            balance_after=user.available_balance,
            action_type=action_type.value,
            ref_type=ref_type.value,
            ref_id=ref_id,
            note=note,
        )
        self.db.add(entry)
        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def earn(
        self,
        user_id: int,
        amount: int,
        action_type: ActionType,
        ref_type: RefType = RefType.NONE,
        ref_id: int | None = None,
        note: str | None = None,
    ) -> Ledger:
        """Add sat to user balance."""
        if amount <= 0:
            raise ValueError('Earn amount must be positive')

        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')

        user.available_balance += amount

        entry = Ledger(
            user_id=user_id,
            amount=amount,
            balance_after=user.available_balance,
            action_type=action_type.value,
            ref_type=ref_type.value,
            ref_id=ref_id,
            note=note,
        )
        self.db.add(entry)
        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def get_balance(self, user_id: int) -> int:
        """Get current balance for a user."""
        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f'User {user_id} not found')
        return user.available_balance

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
