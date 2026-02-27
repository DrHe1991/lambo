from datetime import date
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.ledger import Ledger, ActionType, RefType
from app.models.revenue import PlatformRevenue

# Revenue split ratio: 80% to creator, 20% to platform
CREATOR_SHARE = 0.80
PLATFORM_SHARE = 0.20


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

    async def spend_with_split(
        self,
        user_id: int,
        amount: int,
        author_id: int,
        spend_action_type: ActionType,
        earn_action_type: ActionType,
        ref_type: RefType = RefType.NONE,
        ref_id: int | None = None,
        revenue_source: str = 'like',
    ) -> tuple[int, int]:
        """Spend sat and split: 80% to author, 20% to platform pool.

        Returns (author_share, platform_share).
        """
        if amount <= 0:
            raise ValueError('Amount must be positive')
        if user_id == author_id:
            raise ValueError('Cannot pay yourself')

        # Calculate split
        author_share = int(amount * CREATOR_SHARE)
        platform_share = amount - author_share

        # Deduct from spender
        await self.spend(
            user_id, amount, spend_action_type,
            ref_type=ref_type, ref_id=ref_id,
        )

        # Pay author (80%)
        if author_share > 0:
            await self.earn(
                author_id, author_share, earn_action_type,
                ref_type=ref_type, ref_id=ref_id,
                note=f'from user {user_id}',
            )

        # Add to platform revenue (20%)
        if platform_share > 0:
            await self._add_platform_revenue(platform_share, revenue_source)

        return author_share, platform_share

    async def _add_platform_revenue(
        self,
        amount: int,
        source: str,
    ) -> None:
        """Add revenue to today's platform pool."""
        today = date.today()

        # Get or create today's record
        result = await self.db.execute(
            select(PlatformRevenue).where(PlatformRevenue.date == today)
        )
        revenue = result.scalar_one_or_none()

        if not revenue:
            revenue = PlatformRevenue(date=today)
            self.db.add(revenue)
            await self.db.flush()

        # Update the appropriate column
        if source == 'like':
            revenue.like_revenue += amount
        elif source == 'comment':
            revenue.comment_revenue += amount
        elif source == 'post':
            revenue.post_revenue += amount
        elif source == 'boost':
            revenue.boost_revenue += amount

        revenue.total += amount
