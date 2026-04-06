import json
import logging
from datetime import datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ai_usage import AIUsage
from app.schemas.ai import ReportVerdict, PostEvaluation

logger = logging.getLogger(__name__)

VALID_QUALITY = ('low', 'medium', 'good', 'great')
VALID_SEVERITY = ('none', 'low', 'high')

EVALUATE_PROMPT = '''\
You are a content screener for BitLink, a social platform with a crypto-powered economy. \
Users post about ANY topic — tech, finance, sports, art, politics, lifestyle, crypto, etc.

Your main job is to:
1. BLOCK harmful content (violence, hate, abuse, scams)
2. TAG content for discovery
3. Give a rough quality estimate (community engagement is the real quality signal)

Respond with ONLY valid JSON matching this exact schema:
{"safe": true, "flags": [], "severity": "none", "tags": ["tag1", "tag2"], "quality": "medium", "summary": ""}

### Safety — THIS IS YOUR PRIMARY JOB. Be strict.

**safe** (severity=none): Normal discussion, opinions, humor, questions, debates, memes.

**unsafe severity=low** (flag but allow, monitor):
- Aggressive language or personal insults directed at individuals
- Unverified serious claims about specific named people
- Mildly suggestive or edgy content that doesn't cross the line
- Misleading headlines without outright fabrication

**unsafe severity=high** (block immediately):
- Violence: threats, glorification of violence, graphic descriptions of harm, incitement
- Hate speech: racism, sexism, homophobia, religious hatred, dehumanizing language
- Harassment: doxxing, stalking, targeted bullying, revenge content
- Sexual: explicit/pornographic content, non-consensual sexual content
- Self-harm: suicide encouragement, pro-eating-disorder content, self-injury promotion
- Minors: any sexual or exploitative content involving minors
- Illegal activity: drug trafficking, weapons sales, fraud instructions
- Scams: phishing links, fake giveaways, pump-and-dump schemes, impersonation
- Terrorism: extremist recruitment, radicalization, terror glorification

Use "flags" to specify which categories triggered (e.g. ["violence", "threats"]).

### Quality — rough initial screen only (community decides the rest):

**low** - Trash / zero-effort / noise:
- Single words or emojis with no substance ("gm", "🚀", "lol")
- Pure spam or self-promotion links
- Copy-pasted text with no original thought

**medium** - Default. Has a point, let the community decide:
- An opinion with basic reasoning
- A question asking for help or advice
- Sharing news or content with a short personal take

**good** - Clearly shows effort:
- Thoughtful analysis with supporting evidence
- Detailed how-to or tutorial
- Well-argued perspective with specifics

**great** - Exceptional depth (rare, be conservative):
- Original research or investigation
- Comprehensive guide with real expertise

When in doubt, default to "medium".

### Tags (2-4 topic tags for content discovery):
- Post about BTC price → ["bitcoin", "price-analysis", "trading"]
- Fitness routine review → ["fitness", "health", "review"]
- Film analysis essay → ["movies", "analysis", "culture"]
- Startup funding story → ["startups", "venture-capital", "entrepreneurship"]
- Cooking recipe share → ["cooking", "recipes", "food"]
- Political opinion piece → ["politics", "opinion"]
- Travel photography → ["travel", "photography"]'''

REPORT_PROMPT = '''\
You are a report adjudicator for BitLink, a crypto-native social platform.
A user has reported content for a policy violation. Evaluate whether the report \
is valid based on the content and the stated reason. Respond with ONLY valid JSON:
{"verdict": "valid"|"invalid"|"escalate", "confidence": 0.0-1.0, "reason": "brief explanation"}
Use "escalate" when you are unsure (confidence < 0.6).'''


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
            verify=settings.env != 'development',
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
            resp_text = e.response.text[:300]
            usage_record.error = f'HTTP {e.response.status_code}: {resp_text}'
            if db:
                db.add(usage_record)
                await db.flush()
            logger.error('Bank of AI API error: %s', usage_record.error)
            raise AIServiceError(resp_text, e.response.status_code)

        except httpx.RequestError as e:
            usage_record.error = str(e)[:200]
            if db:
                db.add(usage_record)
                await db.flush()
            logger.error('Bank of AI request error: %s', e)
            raise AIServiceError('LLM service unavailable', 503)

    @staticmethod
    def _estimate_cost(input_tokens: int, output_tokens: int) -> float:
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

    @staticmethod
    def _normalize_evaluation(data: dict) -> dict:
        """Normalize unexpected values to valid defaults (fail safe)."""
        if data.get('quality') not in VALID_QUALITY:
            data['quality'] = 'medium'
        if data.get('severity') not in VALID_SEVERITY:
            data['severity'] = 'none'
        if not isinstance(data.get('tags'), list):
            data['tags'] = []
        data['tags'] = [str(t).lower().strip() for t in data['tags'][:5]]
        if not isinstance(data.get('safe'), bool):
            data['safe'] = True
        if not isinstance(data.get('flags'), list):
            data['flags'] = []
        if not isinstance(data.get('summary'), str):
            data['summary'] = ''
        return data

    # ── Batched evaluation (one call does everything) ────────────────────

    async def evaluate_post(
        self,
        content: str,
        title: str | None = None,
        post_type: str = 'note',
        *,
        db: AsyncSession | None = None,
        ref_id: int | None = None,
    ) -> PostEvaluation:
        """Evaluate a post in one call: moderation + tags + quality + summary."""
        user_msg = f'Post type: {post_type}\n'
        if title:
            user_msg += f'Title: {title}\n'
        user_msg += f'Content:\n{content[:3000]}'

        for attempt in range(2):
            try:
                temp = 0.2 if attempt == 0 else 0.1
                raw = await self._chat(
                    messages=[
                        {'role': 'system', 'content': EVALUATE_PROMPT},
                        {'role': 'user', 'content': user_msg},
                    ],
                    feature='evaluate',
                    temperature=temp,
                    max_tokens=300,
                    ref_type='post',
                    ref_id=ref_id,
                    db=db,
                )
                data = self._parse_json(raw)
                data = self._normalize_evaluation(data)
                return PostEvaluation(**data)
            except (json.JSONDecodeError, TypeError, ValueError) as e:
                if attempt == 0:
                    logger.warning('AI eval parse failed (attempt 1), retrying: %s', e)
                    continue
                logger.warning('AI eval parse failed (attempt 2), using defaults')
                return PostEvaluation()
            except AIServiceError:
                if attempt == 0:
                    continue
                raise

    # ── Report judging (standalone) ──────────────────────────────────────

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

        for attempt in range(2):
            try:
                raw = await self._chat(
                    messages=[
                        {'role': 'system', 'content': REPORT_PROMPT},
                        {'role': 'user', 'content': user_msg},
                    ],
                    feature='report',
                    temperature=0.2 if attempt == 0 else 0.1,
                    max_tokens=300,
                    ref_type='report',
                    ref_id=ref_id,
                    db=db,
                )
                data = self._parse_json(raw)
                return ReportVerdict(**data)
            except (json.JSONDecodeError, TypeError, ValueError):
                if attempt == 0:
                    continue
                return ReportVerdict(
                    verdict='escalate', confidence=0.0,
                    reason='AI could not evaluate — escalated for human review',
                )
            except AIServiceError:
                if attempt == 0:
                    continue
                raise


ai_service = AIService()
