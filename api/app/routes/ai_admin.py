from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.ai_usage import AIUsage

router = APIRouter()


@router.get('/usage/summary')
async def get_usage_summary(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Get AI usage summary: total tokens, cost, and breakdown by feature."""
    since = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(
            AIUsage.feature,
            func.count(AIUsage.id).label('calls'),
            func.sum(AIUsage.input_tokens).label('input_tokens'),
            func.sum(AIUsage.output_tokens).label('output_tokens'),
            func.sum(AIUsage.estimated_cost_usd).label('cost_usd'),
            func.count(AIUsage.error).label('errors'),
        )
        .where(AIUsage.created_at >= since)
        .group_by(AIUsage.feature)
    )
    rows = result.all()

    features = {}
    totals = {'calls': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost_usd': 0.0, 'errors': 0}

    for row in rows:
        feature_data = {
            'calls': row.calls,
            'input_tokens': row.input_tokens or 0,
            'output_tokens': row.output_tokens or 0,
            'cost_usd': round(row.cost_usd or 0, 4),
            'errors': row.errors,
        }
        features[row.feature] = feature_data
        for k in totals:
            totals[k] += feature_data[k]

    totals['cost_usd'] = round(totals['cost_usd'], 4)

    return {
        'period_days': days,
        'since': since.isoformat(),
        'totals': totals,
        'by_feature': features,
    }


@router.get('/usage/daily')
async def get_daily_usage(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Get daily AI usage breakdown."""
    since = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(
            func.date(AIUsage.created_at).label('day'),
            func.count(AIUsage.id).label('calls'),
            func.sum(AIUsage.input_tokens).label('input_tokens'),
            func.sum(AIUsage.output_tokens).label('output_tokens'),
            func.sum(AIUsage.estimated_cost_usd).label('cost_usd'),
        )
        .where(AIUsage.created_at >= since)
        .group_by(func.date(AIUsage.created_at))
        .order_by(func.date(AIUsage.created_at).desc())
    )
    rows = result.all()

    return {
        'period_days': days,
        'daily': [
            {
                'date': str(row.day),
                'calls': row.calls,
                'input_tokens': row.input_tokens or 0,
                'output_tokens': row.output_tokens or 0,
                'cost_usd': round(row.cost_usd or 0, 4),
            }
            for row in rows
        ],
    }
