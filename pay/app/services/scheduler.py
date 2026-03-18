import asyncio
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.db.database import AsyncSessionLocal
from app.services.rebalance_service import RebalanceService


scheduler = AsyncIOScheduler()


async def scheduled_rebalance():
    '''Periodic rebalance job - runs every 12 hours.'''
    print(f'[{datetime.utcnow()}] Running scheduled rebalance...')
    try:
        async with AsyncSessionLocal() as session:
            service = RebalanceService(session)
            log = await service.check_and_rebalance('scheduled')
            await session.commit()
            if log:
                print(f'Rebalance completed: {log.status}')
            else:
                print('Rebalance skipped (no action needed)')
    except Exception as e:
        print(f'Rebalance error: {e}')


async def sync_reserve_snapshot():
    '''Periodic reserve snapshot - runs every 5 minutes.'''
    try:
        async with AsyncSessionLocal() as session:
            service = RebalanceService(session)
            snapshot = await service.create_snapshot()
            await session.commit()
            print(f'Reserve snapshot: BTC={snapshot.btc_balance}, USDT={snapshot.usdt_balance}')
    except Exception as e:
        print(f'Snapshot error: {e}')


def setup_scheduler():
    '''Initialize and configure the scheduler.'''
    # Rebalance every 12 hours
    scheduler.add_job(
        scheduled_rebalance,
        trigger=IntervalTrigger(hours=12),
        id='rebalance_job',
        name='Periodic Rebalance',
        replace_existing=True,
    )
    
    # Reserve snapshot every 5 minutes
    scheduler.add_job(
        sync_reserve_snapshot,
        trigger=IntervalTrigger(minutes=5),
        id='snapshot_job',
        name='Reserve Snapshot',
        replace_existing=True,
    )


def start_scheduler():
    '''Start the scheduler.'''
    setup_scheduler()
    scheduler.start()
    print('Scheduler started')


def stop_scheduler():
    '''Stop the scheduler.'''
    scheduler.shutdown()
    print('Scheduler stopped')
