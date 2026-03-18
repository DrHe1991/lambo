from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.routes import posts, users, chat, drafts, pay, settlement


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources."""
    await init_db()
    yield


app = FastAPI(
    title='BitLink API',
    description='Backend API for BitLink social platform',
    version='0.1.0',
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

# Routes - Minimal system (rewards and challenges removed)
app.include_router(users.router, prefix='/api/users', tags=['users'])
app.include_router(posts.router, prefix='/api/posts', tags=['posts'])
app.include_router(chat.router, prefix='/api/chat', tags=['chat'])
app.include_router(drafts.router, prefix='/api/drafts', tags=['drafts'])
app.include_router(pay.router, prefix='/api/pay', tags=['pay'])
app.include_router(settlement.router, prefix='/api/settlement', tags=['settlement'])


@app.get('/health')
async def health_check():
    """Health check endpoint."""
    return {'status': 'ok', 'service': 'bitlink-api'}
