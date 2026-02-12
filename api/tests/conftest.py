import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.db.database import Base, get_db
from app.config import settings


# Test database URL
TEST_DATABASE_URL = settings.database_url.replace('/bitline', '/bitline_test')

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    """Override database dependency for tests."""
    async with TestSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope='session')
async def setup_db():
    """Create test database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client(setup_db):
    """Async HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as ac:
        yield ac


@pytest.fixture
async def db_session(setup_db):
    """Database session for direct queries in tests."""
    async with TestSession() as session:
        yield session
        await session.rollback()
