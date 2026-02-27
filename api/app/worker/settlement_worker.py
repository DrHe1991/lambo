"""
Settlement Worker

Background service that handles periodic settlement tasks:
- Daily: Update discovery scores (optional, for analytics)
- Weekly: Distribute quality subsidies from platform revenue

Uses APScheduler for job scheduling.
"""
import asyncio
import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.services.subsidy_service import run_weekly_subsidy
from app.services.discovery_service import DiscoveryService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger('settlement_worker')

# Database URL from environment
import os
DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql+asyncpg://bitlink:bitlink_dev_password@postgres:5432/bitlink'
)


class SettlementWorker:
    """Background worker for settlement tasks."""

    def __init__(self):
        self.engine = create_async_engine(DATABASE_URL, echo=False)
        self.async_session = async_sessionmaker(
            self.engine, expire_on_commit=False
        )
        self.scheduler = AsyncIOScheduler()

    async def start(self):
        """Start the worker and scheduler."""
        logger.info('Starting Settlement Worker...')

        # Schedule weekly subsidy distribution (Sunday 3 AM UTC)
        self.scheduler.add_job(
            self._run_weekly_subsidy,
            CronTrigger(day_of_week='sun', hour=3, minute=0),
            id='weekly_subsidy',
            name='Weekly Quality Subsidy Distribution',
            replace_existing=True,
        )

        # Schedule daily discovery settlement (every day 4 AM UTC)
        self.scheduler.add_job(
            self._run_daily_settlement,
            CronTrigger(hour=4, minute=0),
            id='daily_settlement',
            name='Daily Discovery Score Settlement',
            replace_existing=True,
        )

        self.scheduler.start()
        logger.info('Scheduler started. Jobs:')
        for job in self.scheduler.get_jobs():
            logger.info(f'  - {job.name}: next run at {job.next_run_time}')

        # Keep running
        try:
            while True:
                await asyncio.sleep(60)
        except (KeyboardInterrupt, SystemExit):
            logger.info('Shutting down...')
            self.scheduler.shutdown()

    async def _run_weekly_subsidy(self):
        """Run weekly quality subsidy distribution."""
        logger.info('Running weekly quality subsidy...')
        try:
            async with self.async_session() as session:
                async with session.begin():
                    result = await run_weekly_subsidy(session)
                    await session.commit()

                logger.info(f'Subsidy result: {result}')
                return result
        except Exception as e:
            logger.error(f'Weekly subsidy failed: {e}', exc_info=True)
            raise

    async def _run_daily_settlement(self):
        """Run daily discovery score settlement (T+7d posts)."""
        logger.info('Running daily settlement...')
        try:
            async with self.async_session() as session:
                async with session.begin():
                    service = DiscoveryService(session)
                    result = await service.settle_mature_posts()
                    await session.commit()

                logger.info(f'Settlement result: {result}')
                return result
        except Exception as e:
            logger.error(f'Daily settlement failed: {e}', exc_info=True)
            raise

    async def run_once(self, job_type: str = 'subsidy'):
        """Run a single job immediately (for testing)."""
        if job_type == 'subsidy':
            return await self._run_weekly_subsidy()
        elif job_type == 'settlement':
            return await self._run_daily_settlement()
        else:
            raise ValueError(f'Unknown job type: {job_type}')


async def main():
    """Entry point for the worker."""
    worker = SettlementWorker()
    await worker.start()


if __name__ == '__main__':
    asyncio.run(main())
