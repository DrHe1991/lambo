import secrets
import hashlib
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import App
from app.schemas import AppCreate, AppResponse, AppWithSecret

router = APIRouter()


def generate_api_key() -> str:
    """Generate a random API key."""
    return secrets.token_hex(32)


def generate_api_secret() -> str:
    """Generate a random API secret."""
    return secrets.token_hex(32)


def hash_secret(secret: str) -> str:
    """Hash API secret for storage."""
    return hashlib.sha256(secret.encode()).hexdigest()


@router.post('', response_model=AppWithSecret, status_code=status.HTTP_201_CREATED)
async def create_app(
    data: AppCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new client application.
    
    Returns the API key and secret. The secret is only shown once and cannot be retrieved later.
    """
    # Check if name already exists
    existing = await db.execute(select(App).where(App.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='App with this name already exists',
        )
    
    api_key = generate_api_key()
    api_secret = generate_api_secret()
    
    app = App(
        name=data.name,
        api_key=api_key,
        api_secret_hash=hash_secret(api_secret),
        description=data.description,
        webhook_url=data.webhook_url,
    )
    
    db.add(app)
    await db.commit()
    await db.refresh(app)
    
    return AppWithSecret(
        id=app.id,
        name=app.name,
        api_key=app.api_key,
        api_secret=api_secret,  # Only returned once
        description=app.description,
        webhook_url=app.webhook_url,
        is_active=app.is_active,
        created_at=app.created_at,
    )


@router.get('/{app_id}', response_model=AppResponse)
async def get_app(
    app_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get application details by ID."""
    result = await db.execute(select(App).where(App.id == app_id))
    app = result.scalar_one_or_none()
    
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='App not found',
        )
    
    return app


@router.get('', response_model=list[AppResponse])
async def list_apps(
    db: AsyncSession = Depends(get_db),
):
    """List all registered applications."""
    result = await db.execute(select(App).order_by(App.created_at.desc()))
    apps = result.scalars().all()
    return apps
