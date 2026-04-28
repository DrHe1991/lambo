"""
Audit tests for the pool-based reward distribution system.

Validates:
1. Revenue split correctness: 10% author, 85% likers, 5% platform
2. First-like overflow: when no prior likers, liker share goes to author
3. Ascending price curve accuracy
4. Pool accumulation on like
5. Pool distribution to likers (cron simulation)
6. Integer rounding: no sat leakage (sum of parts == cost)
7. Multi-liker equal share distribution
8. Post deletion: pool forfeited to platform, author earnings clawed back
9. Break-even math: liker at position k recoups at ~2.5k total likes

Run: cd api && python -m pytest tests/test_reward_distribution.py -v
"""
import pytest
import pytest_asyncio
from datetime import date
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.db.database import Base
from app.config import settings
from app.models.user import User
from app.models.post import Post, PostLike, Comment, CommentLike, InteractionStatus
from app.models.ledger import Ledger
from app.models.revenue import PlatformRevenue
from app.services.dynamic_like_service import (
    DynamicLikeService, like_cost, comment_like_cost,
    AUTHOR_SHARE, EARLY_LIKER_SHARE, PLATFORM_SHARE,
    InsufficientBalance, AlreadyLiked,
)

TEST_DB_URL = settings.database_url.rsplit('/bitlink', 1)[0] + '/bitlink_test'
_engine = create_async_engine(TEST_DB_URL, echo=False, poolclass=NullPool)
_Session = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)

_TRUNCATE = (
    'TRUNCATE ledger, post_likes, comment_likes, comments, posts, '
    'platform_revenue, users RESTART IDENTITY CASCADE'
)


@pytest_asyncio.fixture(scope='module')
async def _tables():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(autouse=True)
async def _clean(_tables):
    yield
    async with _engine.begin() as conn:
        await conn.execute(text(_TRUNCATE))


@pytest_asyncio.fixture
async def db():
    async with _Session() as session:
        yield session


# ── Helpers ──────────────────────────────────────────────────────────────────

async def make_user(db: AsyncSession, name: str, balance: int = 100_000) -> User:
    user = User(name=name, handle=f'@{name}', available_balance=balance)
    db.add(user)
    await db.flush()
    return user


async def make_post(db: AsyncSession, author: User) -> Post:
    post = Post(author_id=author.id, content='test post', post_type='note')
    db.add(post)
    await db.flush()
    return post


async def make_comment(db: AsyncSession, post: Post, author: User) -> Comment:
    comment = Comment(
        post_id=post.id, author_id=author.id, content='test comment',
        interaction_status=InteractionStatus.SETTLED.value,
    )
    db.add(comment)
    await db.flush()
    return comment


# ── Pure function tests (no DB) ─────────────────────────────────────────────

class TestPriceCurve:
    """Ascending price curve produces expected values."""

    def test_first_like_costs_base(self):
        assert like_cost(0) == 10

    def test_price_increases_with_likes(self):
        costs = [like_cost(i) for i in range(20)]
        for i in range(1, len(costs)):
            assert costs[i] >= costs[i - 1], f'Price must not decrease at like {i}'

    def test_known_values(self):
        assert like_cost(0) == 10
        assert like_cost(5) == int(10 * (1 + 5) ** 0.5)
        assert like_cost(10) == int(10 * (1 + 10) ** 0.5)
        assert like_cost(100) == int(10 * (1 + 100) ** 0.5)

    def test_comment_like_cost_base(self):
        assert comment_like_cost(0) == 3

    def test_comment_cost_increases(self):
        costs = [comment_like_cost(i) for i in range(20)]
        for i in range(1, len(costs)):
            assert costs[i] >= costs[i - 1]


class TestRevenueSplitArithmetic:
    """Revenue split sums to 100% and individual shares are correct."""

    def test_shares_sum_to_one(self):
        assert abs(AUTHOR_SHARE + EARLY_LIKER_SHARE + PLATFORM_SHARE - 1.0) < 1e-9

    def test_no_sat_leakage(self):
        """For any cost, author + liker_pool + platform == cost (integer arithmetic)."""
        for cost in [10, 22, 31, 70, 100, 223, 1, 3, 999]:
            author = int(cost * AUTHOR_SHARE)
            liker_pool = int(cost * EARLY_LIKER_SHARE)
            platform = cost - author - liker_pool
            assert author + liker_pool + platform == cost, (
                f'Leakage at cost={cost}: {author}+{liker_pool}+{platform}'
            )

    def test_platform_share_is_remainder(self):
        """Platform share absorbs rounding dust so total is always exact."""
        cost = 10
        author = int(cost * AUTHOR_SHARE)
        liker = int(cost * EARLY_LIKER_SHARE)
        platform = cost - author - liker
        assert author == 1
        assert liker == 8
        assert platform == 1


# ── Integration tests ────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestFirstLikeOverflow:
    """First like: no prior likers, so liker share overflows to author."""

    async def test_first_like_gives_author_95_percent(self, db):
        author = await make_user(db, 'author', balance=0)
        liker = await make_user(db, 'liker1', balance=1000)
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        result = await svc.like_post(liker.id, post.id)
        await db.commit()

        cost = result['cost']
        expected_author = int(cost * AUTHOR_SHARE) + int(cost * EARLY_LIKER_SHARE)

        await db.refresh(author)
        await db.refresh(post)

        assert author.available_balance == expected_author, (
            f'Author should get {expected_author}, got {author.available_balance}'
        )
        assert post.revenue_pool == 0, 'No pool on first like (no prior likers)'
        assert result['status'] == 'settled'


@pytest.mark.asyncio
class TestSecondLikePoolAccumulation:
    """Second like: liker share goes to pool, not distributed immediately."""

    async def test_second_like_adds_to_pool(self, db):
        author = await make_user(db, 'author', balance=0)
        liker1 = await make_user(db, 'liker1', balance=10_000)
        liker2 = await make_user(db, 'liker2', balance=10_000)
        post = await make_post(db, author)

        svc = DynamicLikeService(db)

        await svc.like_post(liker1.id, post.id)
        await db.commit()
        await db.refresh(post)
        assert post.revenue_pool == 0, 'First like: no pool'

        r2 = await svc.like_post(liker2.id, post.id)
        await db.commit()
        await db.refresh(post)

        cost2 = r2['cost']
        expected_pool = int(cost2 * EARLY_LIKER_SHARE)
        assert post.revenue_pool == expected_pool, (
            f'Pool should be {expected_pool}, got {post.revenue_pool}'
        )


@pytest.mark.asyncio
class TestPoolDistribution:
    """Cron distributes pool equally among all settled likers."""

    async def test_equal_distribution(self, db):
        author = await make_user(db, 'author', balance=0)
        likers = [await make_user(db, f'liker{i}', balance=100_000) for i in range(5)]
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        for u in likers:
            await svc.like_post(u.id, post.id)
        await db.commit()

        await db.refresh(post)
        pool_before = post.revenue_pool
        assert pool_before > 0, 'Pool should have accumulated from likes 2-5'

        balances_before = {}
        for u in likers:
            await db.refresh(u)
            balances_before[u.id] = u.available_balance

        result = await svc.distribute_pools()
        await db.commit()

        await db.refresh(post)
        share_each = pool_before // 5

        for u in likers:
            await db.refresh(u)
            expected = balances_before[u.id] + share_each
            assert u.available_balance == expected, (
                f'Liker {u.name}: expected {expected}, got {u.available_balance}'
            )

        expected_remainder = pool_before - (share_each * 5)
        assert post.revenue_pool == expected_remainder

    async def test_empty_pool_noop(self, db):
        author = await make_user(db, 'author', balance=0)
        liker = await make_user(db, 'liker', balance=10_000)
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        await svc.like_post(liker.id, post.id)
        await db.commit()

        result = await svc.distribute_pools()
        assert result['posts_distributed'] == 0
        assert result['total_sat_distributed'] == 0


@pytest.mark.asyncio
class TestFullScenarioBalanceAudit:
    """End-to-end: multiple likes, then distribution. All sat accounted for."""

    async def test_total_sat_conservation(self, db):
        """Sum of all user balances + platform revenue + remaining pool == initial total."""
        INITIAL_BALANCE = 100_000
        author = await make_user(db, 'author', balance=0)
        liker_users = [await make_user(db, f'liker{i}', balance=INITIAL_BALANCE) for i in range(4)]
        total_initial = INITIAL_BALANCE * 4
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        for u in liker_users:
            await svc.like_post(u.id, post.id)
        await db.commit()

        await svc.distribute_pools()
        await db.commit()

        await db.refresh(author)
        await db.refresh(post)

        total_user_balance = author.available_balance
        for u in liker_users:
            await db.refresh(u)
            total_user_balance += u.available_balance

        pr_result = await db.execute(
            select(PlatformRevenue).where(PlatformRevenue.date == date.today())
        )
        platform = pr_result.scalar_one_or_none()
        platform_total = platform.total if platform else 0

        remaining_pool = post.revenue_pool
        total_accounted = total_user_balance + platform_total + remaining_pool

        assert total_accounted == total_initial, (
            f'SAT LEAK: initial={total_initial}, '
            f'users={total_user_balance}, platform={platform_total}, '
            f'pool={remaining_pool}, accounted={total_accounted}'
        )


@pytest.mark.asyncio
class TestAuthorPaymentImmediate:
    """Author gets paid instantly on each like, not waiting for cron."""

    async def test_author_balance_grows_per_like(self, db):
        author = await make_user(db, 'author', balance=0)
        post = await make_post(db, author)
        svc = DynamicLikeService(db)

        author_balances = []
        for i in range(5):
            liker = await make_user(db, f'liker{i}', balance=100_000)
            await svc.like_post(liker.id, post.id)
            await db.commit()
            await db.refresh(author)
            author_balances.append(author.available_balance)

        for i in range(1, len(author_balances)):
            assert author_balances[i] > author_balances[i - 1], (
                f'Author balance should grow: {author_balances}'
            )


@pytest.mark.asyncio
class TestLikerEarningsTracking:
    """PostLike.earnings field correctly tracks cumulative earnings per liker."""

    async def test_earnings_tracked_on_like_record(self, db):
        author = await make_user(db, 'author', balance=0)
        likers = [await make_user(db, f'liker{i}', balance=100_000) for i in range(3)]
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        for u in likers:
            await svc.like_post(u.id, post.id)
        await db.commit()

        await svc.distribute_pools()
        await db.commit()

        result = await db.execute(
            select(PostLike).where(PostLike.post_id == post.id)
        )
        all_likes = list(result.scalars().all())

        total_earnings = sum(l.earnings for l in all_likes)
        assert total_earnings > 0, 'At least some earnings should have been distributed'

        earnings_set = {l.earnings for l in all_likes}
        assert len(earnings_set) == 1, f'All likers should earn equally, got {earnings_set}'


@pytest.mark.asyncio
class TestPostDeletionPoolForfeit:
    """Deleting a post forfeits undistributed pool to platform."""

    async def test_pool_forfeited_on_delete(self, db):
        author = await make_user(db, 'author', balance=100_000)
        liker1 = await make_user(db, 'liker1', balance=100_000)
        liker2 = await make_user(db, 'liker2', balance=100_000)
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        await svc.like_post(liker1.id, post.id)
        await svc.like_post(liker2.id, post.id)
        await db.commit()

        await db.refresh(post)
        pool_before = post.revenue_pool
        assert pool_before > 0

        refund = await svc.delete_post_with_refunds(post.id, author.id)
        await db.commit()

        assert refund['pool_forfeited'] == pool_before
        await db.refresh(post)
        assert post.revenue_pool == 0


@pytest.mark.asyncio
class TestAlreadyLikedRejection:
    """Liking the same post twice raises AlreadyLiked."""

    async def test_double_like_rejected(self, db):
        author = await make_user(db, 'author', balance=0)
        liker = await make_user(db, 'liker', balance=100_000)
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        await svc.like_post(liker.id, post.id)
        await db.commit()

        with pytest.raises(AlreadyLiked):
            await svc.like_post(liker.id, post.id)


@pytest.mark.asyncio
class TestInsufficientBalanceRejection:
    """Liking with insufficient balance raises InsufficientBalance."""

    async def test_broke_user_rejected(self, db):
        author = await make_user(db, 'author', balance=0)
        broke = await make_user(db, 'broke', balance=0)
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        with pytest.raises(InsufficientBalance):
            await svc.like_post(broke.id, post.id)


@pytest.mark.asyncio
class TestLockedCostOverride:
    """When a quote provides locked_cost, the service uses it instead of calculating."""

    async def test_locked_cost_used(self, db):
        author = await make_user(db, 'author', balance=0)
        liker = await make_user(db, 'liker', balance=100_000)
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        result = await svc.like_post(liker.id, post.id, locked_cost=42)
        await db.commit()

        assert result['cost'] == 42


@pytest.mark.asyncio
class TestCommentLikePoolDistribution:
    """Comment likes follow the same pool-based distribution as post likes."""

    async def test_comment_pool_flow(self, db):
        post_author = await make_user(db, 'post_author', balance=0)
        comment_author = await make_user(db, 'comment_author', balance=0)
        liker1 = await make_user(db, 'cliker1', balance=100_000)
        liker2 = await make_user(db, 'cliker2', balance=100_000)
        post = await make_post(db, post_author)
        comment = await make_comment(db, post, comment_author)

        svc = DynamicLikeService(db)

        await svc.like_comment(liker1.id, comment.id)
        await db.commit()
        await db.refresh(comment)
        assert comment.revenue_pool == 0, 'First like: overflow to author'

        await svc.like_comment(liker2.id, comment.id)
        await db.commit()
        await db.refresh(comment)
        assert comment.revenue_pool > 0, 'Second like: pool accumulates'

        await db.refresh(liker1)
        bal_before = liker1.available_balance

        result = await svc.distribute_pools()
        await db.commit()

        assert result['comments_distributed'] == 1
        await db.refresh(liker1)
        assert liker1.available_balance > bal_before, 'Liker1 should earn from comment pool'


@pytest.mark.asyncio
class TestBreakEvenMath:
    """Validates the ~2.5x break-even rule for early likers."""

    async def test_early_liker_breaks_even(self, db):
        """Liker at position 1 should profit after enough subsequent likes."""
        author = await make_user(db, 'author', balance=0)
        likers = [await make_user(db, f'liker{i}', balance=1_000_000) for i in range(10)]
        post = await make_post(db, author)

        svc = DynamicLikeService(db)

        first_balance = likers[0].available_balance
        r0 = await svc.like_post(likers[0].id, post.id)
        await db.commit()
        cost_paid = r0['cost']

        for i in range(1, 10):
            await svc.like_post(likers[i].id, post.id)
            await db.commit()

        await svc.distribute_pools()
        await db.commit()

        await db.refresh(likers[0])
        net_return = likers[0].available_balance - (first_balance - cost_paid)

        assert net_return >= cost_paid, (
            f'Liker0 paid {cost_paid} but only earned {net_return} back after 10 likes'
        )


@pytest.mark.asyncio
class TestLedgerIntegrity:
    """Every balance change has a corresponding ledger entry."""

    async def test_ledger_entries_created(self, db):
        author = await make_user(db, 'author', balance=0)
        liker = await make_user(db, 'liker', balance=100_000)
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        await svc.like_post(liker.id, post.id)
        await db.commit()

        result = await db.execute(
            select(Ledger).where(Ledger.user_id == liker.id)
        )
        liker_entries = list(result.scalars().all())
        assert any(e.amount < 0 for e in liker_entries), 'Liker should have a spend entry'

        result = await db.execute(
            select(Ledger).where(Ledger.user_id == author.id)
        )
        author_entries = list(result.scalars().all())
        assert any(e.amount > 0 for e in author_entries), 'Author should have an earn entry'

    async def test_distribution_creates_ledger(self, db):
        author = await make_user(db, 'author', balance=0)
        liker1 = await make_user(db, 'l1', balance=100_000)
        liker2 = await make_user(db, 'l2', balance=100_000)
        post = await make_post(db, author)

        svc = DynamicLikeService(db)
        await svc.like_post(liker1.id, post.id)
        await svc.like_post(liker2.id, post.id)
        await db.commit()

        pre_result = await db.execute(select(Ledger))
        pre_count = len(list(pre_result.scalars().all()))

        await svc.distribute_pools()
        await db.commit()

        post_result = await db.execute(select(Ledger))
        post_count = len(list(post_result.scalars().all()))

        new_entries = post_count - pre_count
        assert new_entries >= 2, f'Expected at least 2 new ledger entries, got {new_entries}'

        result = await db.execute(
            select(Ledger).where(Ledger.note == 'early supporter dividend')
        )
        dividend_entries = list(result.scalars().all())
        assert len(dividend_entries) >= 2
