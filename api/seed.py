"""Seed script — wipe all data and create fresh test accounts ready for testing.

Usage (from inside the api container):
    python seed.py

Usage (from host, via docker):
    docker compose exec api python seed.py
"""
import asyncio
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import engine, async_session
from app.models.user import User
from app.models.auth import UserAuthProvider  # noqa: F401 — needed for relationship resolution
from app.models.ledger import Ledger, ActionType, RefType


# Test accounts to create
TEST_USERS = [
    {
        'name': 'Alice',
        'handle': 'alice',
        'bio': 'Test user — content creator',
        'deposit': 50_000,
    },
    {
        'name': 'Bob',
        'handle': 'bob',
        'bio': 'Test user — curator & commenter',
        'deposit': 50_000,
    },
    {
        'name': 'Eve',
        'handle': 'eve',
        'bio': 'Test user — challenger & reporter',
        'deposit': 50_000,
    },
]


async def wipe_all(db: AsyncSession):
    """Truncate all tables in dependency-safe order."""
    tables = [
        'interaction_logs',
        'platform_revenue',
        'ledger',
        'comment_likes',
        'post_likes',
        'comments',
        'posts',
        'messages',
        'chat_members',
        'chat_sessions',
        'follows',
        'refresh_tokens',
        'user_auth_providers',
        'users',
    ]
    for table in tables:
        try:
            await db.execute(text(f'TRUNCATE TABLE {table} RESTART IDENTITY CASCADE'))
        except Exception:
            pass  # Table may not exist
    await db.commit()
    print('✓ All tables wiped')


async def create_users(db: AsyncSession):
    """Create test users with initial deposits."""
    for u in TEST_USERS:
        user = User(
            name=u['name'],
            handle=u['handle'],
            bio=u['bio'],
            available_balance=u['deposit'],
            free_posts_remaining=1,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)

        # Record deposit in ledger
        entry = Ledger(
            user_id=user.id,
            amount=u['deposit'],
            balance_after=u['deposit'],
            action_type=ActionType.DEPOSIT.value,
            ref_type=RefType.NONE.value,
            note=f'Seed deposit ({u["deposit"]} sat)',
        )
        db.add(entry)

        print(f'  ✓ {u["name"]} (@{u["handle"]}) — {u["deposit"]} sat, id={user.id}')

    await db.commit()


async def main():
    print()
    print('=' * 50)
    print('  BitLink Seed Script')
    print('=' * 50)
    print()

    async with async_session() as db:
        print('[1/2] Wiping all data...')
        await wipe_all(db)

        print('[2/2] Creating test users...')
        await create_users(db)

    await engine.dispose()

    print()
    print('Done! Ready for testing.')
    print()
    print('  Users:')
    for u in TEST_USERS:
        print(f'    @{u["handle"]}  —  {u["deposit"]:,} sat  —  1 free post')
    print()


if __name__ == '__main__':
    asyncio.run(main())
