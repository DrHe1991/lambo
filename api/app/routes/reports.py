import logging

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.user import User
from app.models.post import Post, PostStatus
from app.models.report import Report, ReportStatus
from app.schemas.ai import ReportCreate, ReportResponse
from app.services.ai_service import ai_service, AIServiceError

router = APIRouter()
logger = logging.getLogger(__name__)

RISK_SCORE_PENALTY = 10


@router.post('', response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    data: ReportCreate,
    reporter_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Report a post. AI judges the report and may auto-hide the post."""
    reporter = await db.get(User, reporter_id)
    if not reporter:
        raise HTTPException(status_code=404, detail='User not found')

    post = await db.get(Post, data.post_id)
    if not post or post.status == PostStatus.DELETED.value:
        raise HTTPException(status_code=404, detail='Post not found')

    if post.author_id == reporter_id:
        raise HTTPException(status_code=400, detail='Cannot report your own post')

    existing = await db.execute(
        select(Report).where(
            Report.post_id == data.post_id,
            Report.reporter_id == reporter_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail='You already reported this post')

    report = Report(
        post_id=data.post_id,
        reporter_id=reporter_id,
        reason=data.reason,
    )

    try:
        verdict = await ai_service.judge_report(
            post.content, data.reason, db=db, ref_id=data.post_id,
        )
        report.verdict = verdict.verdict
        report.confidence = verdict.confidence
        report.ai_reason = verdict.reason

        action = 'none'
        if verdict.verdict == 'valid' and verdict.confidence >= 0.7:
            post.status = PostStatus.CHALLENGED.value
            action = 'post_hidden'
            author = await db.get(User, post.author_id)
            if author:
                author.risk_score = min(1000, author.risk_score + RISK_SCORE_PENALTY)
        elif verdict.verdict == 'escalate':
            action = 'escalated_for_review'

        report.action_taken = action

    except AIServiceError:
        logger.warning('AI report judging failed for post %d, escalating', data.post_id)
        report.verdict = ReportStatus.ESCALATED.value
        report.ai_reason = 'AI unavailable — escalated for human review'
        report.action_taken = 'escalated_for_review'

    db.add(report)
    await db.flush()

    return ReportResponse(
        id=report.id,
        post_id=report.post_id,
        reporter_id=report.reporter_id,
        reason=report.reason,
        verdict=report.verdict,
        confidence=report.confidence,
        ai_reason=report.ai_reason,
        action_taken=report.action_taken,
        created_at=report.created_at.isoformat(),
    )


@router.get('', response_model=list[ReportResponse])
async def get_reports(
    post_id: int | None = Query(None),
    verdict: str | None = Query(None, pattern=r'^(pending|valid|invalid|escalated)$'),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List reports with optional filters (admin endpoint)."""
    query = select(Report).order_by(desc(Report.created_at))

    if post_id is not None:
        query = query.where(Report.post_id == post_id)
    if verdict:
        query = query.where(Report.verdict == verdict)

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    reports = list(result.scalars().all())

    return [
        ReportResponse(
            id=r.id,
            post_id=r.post_id,
            reporter_id=r.reporter_id,
            reason=r.reason,
            verdict=r.verdict,
            confidence=r.confidence,
            ai_reason=r.ai_reason,
            action_taken=r.action_taken,
            created_at=r.created_at.isoformat(),
        )
        for r in reports
    ]
