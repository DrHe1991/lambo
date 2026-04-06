import json
import logging
from datetime import datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ai_usage import AIUsage
from app.schemas.ai import (
    ReportVerdict, ContentScore, ModerationResult, BoostTargeting,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPTS = {
    'moderation': (
        'You are a content safety moderator for BitLink, a crypto-native social platform. '
        'Evaluate the post for policy violations: hate speech, harassment, scams, fraud, '
        'illegal content, or spam. Respond with ONLY valid JSON:\n'
        '{"safe": true/false, "flags": ["list of violations"], '
        '"severity": "none"|"low"|"high"}\n'
        'severity=high means immediate removal. severity=low means flag for review.'
    ),
    'quality_score': (
        'You are a content quality evaluator for BitLink, a crypto-native social platform. '
        'Score the post from 0-100 based on originality, substance, readability, and '
        'effort. Also suggest up to 5 topic tags. Respond with ONLY valid JSON:\n'
        '{"quality_score": 0-100, "tags": ["tag1", "tag2"]}\n'
        'Score guide: 0-20=spam/low-effort, 21-50=average, 51-80=good, 81-100=exceptional.'
    ),
    'report': (
        'You are a report adjudicator for BitLink, a crypto-native social platform. '
        'A user has reported content for a policy violation. Evaluate whether the report '
        'is valid based on the content and the stated reason. Respond with ONLY valid JSON:\n'
        '{"verdict": "valid"|"invalid"|"escalate", "confidence": 0.0-1.0, '
        '"reason": "brief explanation"}\n'
        'Use "escalate" when you are unsure (confidence < 0.6).'
    ),
    'summary': (
        'You are a concise summarizer for BitLink articles. '
        'Write a 1-2 sentence TL;DR that captures the key point. '
        'Respond with ONLY the summary text, no JSON, no quotes.'
    ),
    'boost': (
        'You are an audience targeting assistant for BitLink, a crypto-native social platform. '
        'Analyze the post content and suggest relevant audience tags, keywords, and a category '
        'for ad targeting. Respond with ONLY valid JSON:\n'
        '{"relevance_tags": ["tag1", "tag2"], "audience_keywords": ["kw1", "kw2"], '
        '"suggested_category": "category"}'
    ),
}


class AIServiceError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class AIService:
    """Client for Bank of AI's OpenAI-compatible LLM endpoint."""

    def __init__(self):
        self.base_url = settings.bankofai_base_url
        self.api_key = settings.bankofai_api_key
        self.model = settings.bankofai_model
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json',
            },
            timeout=30.0,
        )

    async def _chat(
        self,
        messages: list[dict],
        *,
        feature: str,
        temperature: float = 0.3,
        max_tokens: int = 500,
        ref_type: str | None = None,
        ref_id: int | None = None,
        db: AsyncSession | None = None,
    ) -> str:
        """Call Bank of AI chat completions and log usage."""
        if not self.api_key:
            raise AIServiceError('BANKOFAI_API_KEY not configured', 503)

        payload = {
            'model': self.model,
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens,
        }

        usage_record = AIUsage(
            feature=feature,
            model=self.model,
            ref_type=ref_type,
            ref_id=ref_id,
            created_at=datetime.utcnow(),
        )

        try:
            resp = await self.client.post('/chat/completions', json=payload)
            resp.raise_for_status()
            data = resp.json()

            content = data['choices'][0]['message']['content']
            usage = data.get('usage', {})
            usage_record.input_tokens = usage.get('prompt_tokens', 0)
            usage_record.output_tokens = usage.get('completion_tokens', 0)
            usage_record.estimated_cost_usd = self._estimate_cost(
                usage_record.input_tokens, usage_record.output_tokens,
            )

            if db:
                db.add(usage_record)
                await db.flush()

            return content

        except httpx.HTTPStatusError as e:
            usage_record.error = f'HTTP {e.response.status_code}: {e.response.text[:200]}'
            if db:
                db.add(usage_record)
                await db.flush()
            logger.error('Bank of AI API error: %s', usage_record.error)
            raise AIServiceError(f'LLM API error: {e.response.status_code}', 502)

        except httpx.RequestError as e:
            usage_record.error = str(e)[:200]
            if db:
                db.add(usage_record)
                await db.flush()
            logger.error('Bank of AI request error: %s', e)
            raise AIServiceError('LLM service unavailable', 503)

    @staticmethod
    def _estimate_cost(input_tokens: int, output_tokens: int) -> float:
        """Rough cost estimate based on typical GPT pricing ($/1M tokens)."""
        input_cost = input_tokens * 3.0 / 1_000_000
        output_cost = output_tokens * 15.0 / 1_000_000
        return round(input_cost + output_cost, 6)

    def _parse_json(self, raw: str) -> dict:
        """Extract JSON from LLM response, handling markdown fences."""
        text = raw.strip()
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:])
            if text.endswith('```'):
                text = text[:-3]
            text = text.strip()
        return json.loads(text)

    # ── Use Case Methods ─────────────────────────────────────────────────

    async def moderate_content(
        self,
        content: str,
        *,
        db: AsyncSession | None = None,
        ref_id: int | None = None,
    ) -> ModerationResult:
        """Screen content for policy violations."""
        raw = await self._chat(
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPTS['moderation']},
                {'role': 'user', 'content': content[:3000]},
            ],
            feature='moderation',
            temperature=0.1,
            max_tokens=200,
            ref_type='post',
            ref_id=ref_id,
            db=db,
        )
        try:
            data = self._parse_json(raw)
            return ModerationResult(**data)
        except (json.JSONDecodeError, ValueError):
            logger.warning('Failed to parse moderation response: %s', raw[:200])
            return ModerationResult(safe=True, flags=[], severity='none')

    async def score_content(
        self,
        title: str | None,
        content: str,
        post_type: str,
        *,
        db: AsyncSession | None = None,
        ref_id: int | None = None,
    ) -> ContentScore:
        """Score content quality (0-100) with topic tags."""
        user_msg = f'Post type: {post_type}\n'
        if title:
            user_msg += f'Title: {title}\n'
        user_msg += f'Content:\n{content[:3000]}'

        raw = await self._chat(
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPTS['quality_score']},
                {'role': 'user', 'content': user_msg},
            ],
            feature='quality_score',
            temperature=0.2,
            max_tokens=150,
            ref_type='post',
            ref_id=ref_id,
            db=db,
        )
        try:
            data = self._parse_json(raw)
            return ContentScore(**data)
        except (json.JSONDecodeError, ValueError):
            logger.warning('Failed to parse quality score: %s', raw[:200])
            return ContentScore(quality_score=50, tags=[])

    async def judge_report(
        self,
        post_content: str,
        report_reason: str,
        *,
        db: AsyncSession | None = None,
        ref_id: int | None = None,
    ) -> ReportVerdict:
        """Judge whether a user report is valid."""
        user_msg = (
            f'Reported content:\n{post_content[:3000]}\n\n'
            f'Report reason: {report_reason}'
        )

        raw = await self._chat(
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPTS['report']},
                {'role': 'user', 'content': user_msg},
            ],
            feature='report',
            temperature=0.2,
            max_tokens=300,
            ref_type='report',
            ref_id=ref_id,
            db=db,
        )
        try:
            data = self._parse_json(raw)
            return ReportVerdict(**data)
        except (json.JSONDecodeError, ValueError):
            logger.warning('Failed to parse report verdict: %s', raw[:200])
            return ReportVerdict(
                verdict='escalate', confidence=0.0,
                reason='AI could not evaluate — escalated for human review',
            )

    async def summarize_content(
        self,
        content: str,
        *,
        db: AsyncSession | None = None,
        ref_id: int | None = None,
    ) -> str:
        """Generate a TL;DR summary for long-form content."""
        raw = await self._chat(
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPTS['summary']},
                {'role': 'user', 'content': content[:5000]},
            ],
            feature='summary',
            temperature=0.4,
            max_tokens=300,
            ref_type='post',
            ref_id=ref_id,
            db=db,
        )
        return raw.strip().strip('"')

    async def get_boost_targeting(
        self,
        content: str,
        *,
        db: AsyncSession | None = None,
        ref_id: int | None = None,
    ) -> BoostTargeting:
        """Analyze content for audience targeting."""
        raw = await self._chat(
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPTS['boost']},
                {'role': 'user', 'content': content[:3000]},
            ],
            feature='boost',
            temperature=0.3,
            max_tokens=200,
            ref_type='post',
            ref_id=ref_id,
            db=db,
        )
        try:
            data = self._parse_json(raw)
            return BoostTargeting(**data)
        except (json.JSONDecodeError, ValueError):
            logger.warning('Failed to parse boost targeting: %s', raw[:200])
            return BoostTargeting()


# TODO(monetization): All AI calls are platform-paid. Future options:
#   - Premium subscription tier
#   - Boost markup (AI targeting cost baked into boost price)
#   - Report deposit (small sat fee, refunded if valid)
#   - Increased platform cut (75/25 instead of 80/20)
#   - Separate AI credit system
# Decision depends on usage data from ai_usage table.

ai_service = AIService()
