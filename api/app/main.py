from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.routes import (
    ai_admin,
    auth,
    chat,
    drafts,
    media,
    posts,
    reports,
    tips,
    users,
    wallet,
)
from app.services.media import media_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources."""
    await init_db()
    media_service.create_buckets()
    yield


app = FastAPI(
    title='BitLink API',
    description='Backend API for BitLink — non-custodial social tipping',
    version='0.2.0',
    lifespan=lifespan,
)

# CORS for mobile app
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# Routes
app.include_router(auth.router, prefix='/api/auth', tags=['auth'])
app.include_router(wallet.router, prefix='/api/wallet', tags=['wallet'])
app.include_router(tips.router, prefix='/api/tips', tags=['tips'])
app.include_router(users.router, prefix='/api/users', tags=['users'])
app.include_router(posts.router, prefix='/api/posts', tags=['posts'])
app.include_router(chat.router, prefix='/api/chat', tags=['chat'])
app.include_router(drafts.router, prefix='/api/drafts', tags=['drafts'])
app.include_router(media.router, prefix='/api/media', tags=['media'])
app.include_router(reports.router, prefix='/api/reports', tags=['reports'])
app.include_router(ai_admin.router, prefix='/api/ai', tags=['ai'])


@app.get('/health')
async def health_check():
    """Health check endpoint."""
    return {'status': 'ok', 'service': 'bitlink-api'}
