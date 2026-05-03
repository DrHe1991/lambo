"""Seed script — wipe all data and create fresh test accounts ready for testing.

In the post-pivot model, users own their funds on-chain. This seed gives them
a placeholder embedded_wallet_address (a known dev EOA) so other endpoints
that require linked wallets work in dev. To actually tip in dev you must
fund those addresses with USDC on Base — or use the staging Privy app.

Usage (from inside the api container):
    python seed.py

Usage (from host, via docker):
    docker compose exec api python seed.py
"""
import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import async_session, engine
from app.models.user import User
from app.models.auth import UserAuthProvider  # noqa: F401 — relationship resolution


# Test accounts. Wallet addresses are deterministic dev EOAs (NOT real funds).
TEST_USERS = [
    {
        'name': 'Alice',
        'handle': 'alice',
        'bio': 'Test creator',
        'privy_user_id': 'did:privy:dev_alice',
        'embedded_wallet_address': '0x00000000000000000000000000000000000A11CE',
    },
    {
        'name': 'Bob',
        'handle': 'bob',
        'bio': 'Test commenter / tipper',
        'privy_user_id': 'did:privy:dev_bob',
        'embedded_wallet_address': '0x00000000000000000000000000000000000B0B00',
    },
    {
        'name': 'Eve',
        'handle': 'eve',
        'bio': 'Test reporter',
        'privy_user_id': 'did:privy:dev_eve',
        'embedded_wallet_address': '0x000000000000000000000000000000000000EE0E',
    },
]


async def wipe_all(db: AsyncSession):
    """Truncate all tables in dependency-safe order."""
    tables = [
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
            pass
    await db.commit()
    print('✓ All tables wiped')


async def create_users(db: AsyncSession):
    """Create test users with placeholder Privy wallets."""
    for u in TEST_USERS:
        user = User(
            name=u['name'],
            handle=u['handle'],
            bio=u['bio'],
            privy_user_id=u['privy_user_id'],
            embedded_wallet_address=u['embedded_wallet_address'],
            free_posts_remaining=3,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        print(f'  ✓ {u["name"]} (@{u["handle"]}) wallet={u["embedded_wallet_address"]} id={user.id}')

    await db.commit()


async def main():
    print()
    print('=' * 50)
    print('  BitLink Seed Script (post-compliance-pivot)')
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
    for u in TEST_USERS:
        print(f'    @{u["handle"]}  —  wallet {u["embedded_wallet_address"][:10]}…')
    print()
    print('Note: dev wallets above are NOT funded. To run a real tip end-to-end,')
    print('use the Privy SDK from the UI (which creates a real Base address).')


if __name__ == '__main__':
    asyncio.run(main())
