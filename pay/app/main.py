import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import apps, wallets, deposits, withdrawals, exchange
from app.services.monitor import start_monitor, stop_monitor
from app.services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: start deposit monitor and scheduler
    logger.info('Starting Pay Service...')
    await start_monitor()
    start_scheduler()
    yield
    # Shutdown: stop monitor and scheduler
    logger.info('Shutting down Pay Service...')
    stop_scheduler()
    await stop_monitor()


app = FastAPI(
    title='Pay Service',
    description='Web3 Payment Gateway - Multi-chain deposit and withdrawal service',
    version='0.1.0',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# Include routers
app.include_router(apps.router, prefix='/apps', tags=['Apps'])
app.include_router(wallets.router, prefix='/wallets', tags=['Wallets'])
app.include_router(deposits.router, prefix='/deposits', tags=['Deposits'])
app.include_router(withdrawals.router, prefix='/withdrawals', tags=['Withdrawals'])
app.include_router(exchange.router, prefix='/exchange', tags=['Exchange'])


@app.get('/health')
async def health_check():
    return {'status': 'healthy', 'service': 'pay'}
