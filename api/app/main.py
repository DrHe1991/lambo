from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.routes import posts, users, chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources."""
    await init_db()
    yield


app = FastAPI(
    title='BitLine API',
    description='Backend API for BitLine social platform',
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

# Routes
app.include_router(users.router, prefix='/api/users', tags=['users'])
app.include_router(posts.router, prefix='/api/posts', tags=['posts'])
app.include_router(chat.router, prefix='/api/chat', tags=['chat'])


@app.get('/health')
async def health_check():
    """Health check endpoint."""
    return {'status': 'ok', 'service': 'bitline-api'}
