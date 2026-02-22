"""Challenge Layer 1 — AI moderation service.

Sends the author's profile, post history, trust score, and the reported content
to an AI model for verdict. Handles fee collection and settlement.
"""
from datetime import datetime, timedelta
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.models.post import Post, Comment, PostStatus
from app.models.ledger import ActionType, RefType
from app.models.challenge import Challenge, ChallengeStatus, ContentType
from app.services.ledger_service import LedgerService, InsufficientBalance
from app.services.trust_service import (
    TrustScoreService, dynamic_fee_multiplier, trust_tier,
)

# Base challenge fee before K(trust) multiplier
BASE_CHALLENGE_FEE = 100

# Fine multiplier on guilty verdict (fine = cost_paid × FINE_P)
FINE_P = 1.0

# Reward splits on guilty
CHALLENGER_REWARD_PCT = 0.35
POOL_FINE_PCT = 0.40
# Remaining 25% reserved for future jury rewards

# On not_guilty: author gets 20% of challenger's fee, pool gets 50%
AUTHOR_VINDICATION_PCT = 0.20
POOL_VINDICATION_PCT = 0.50

# Challenge window: content must be < 7 days old
CHALLENGE_WINDOW_DAYS = 7


class ChallengeError(Exception):
    """Raised for challenge business logic errors."""
    pass


class ChallengeService:
    """Handles Layer 1 AI challenge flow."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.ledger = LedgerService(db)
        self.trust = TrustScoreService(db)

    async def create_challenge(
        self,
        challenger_id: int,
        content_type: str,
        content_id: int,
        reason: str,
    ) -> Challenge:
        """Create a new challenge: validate, charge fee, call AI, settle."""
        # Load challenger
        challenger = await self.db.get(User, challenger_id)
        if not challenger:
            raise ChallengeError('Challenger not found')

        # Load content + author
        content_text, author_id, cost_paid = await self._load_content(
            content_type, content_id,
        )

        if challenger_id == author_id:
            raise ChallengeError('Cannot challenge your own content')

        author = await self.db.get(User, author_id)
        if not author:
            raise ChallengeError('Content author not found')

        # Check challenge window (7 days)
        await self._check_window(content_type, content_id)

        # Check not already challenged
        await self._check_duplicate(content_type, content_id)

        # Calculate and charge fee: F_L1 = 100 × K(trust)
        k = dynamic_fee_multiplier(challenger.trust_score)
        fee = max(1, int(round(BASE_CHALLENGE_FEE * k)))

        try:
            await self.ledger.spend(
                challenger_id, fee, ActionType.CHALLENGE_FEE,
                ref_type=RefType.CHALLENGE, ref_id=None,
                note=f'Challenge fee ({fee} sat)',
            )
        except InsufficientBalance:
            raise ChallengeError(f'Insufficient balance. Need {fee} sat.')

        # Build AI context with author profile + history
        ai_context = await self._build_ai_context(author, content_text, reason)

        # Call AI for verdict
        verdict, ai_reason, confidence = await self._call_ai_moderation(
            ai_context, content_text, reason,
        )

        # Create challenge record
        challenge = Challenge(
            content_type=content_type,
            content_id=content_id,
            challenger_id=challenger_id,
            author_id=author_id,
            reason=reason,
            layer=1,
            fee_paid=fee,
            ai_verdict=verdict,
            ai_reason=ai_reason,
            ai_confidence=confidence,
            status=verdict,
            resolved_at=datetime.utcnow(),
        )
        self.db.add(challenge)
        await self.db.flush()
        await self.db.refresh(challenge)

        # Settle based on verdict
        if verdict == ChallengeStatus.GUILTY.value:
            await self._settle_guilty(challenge, author, challenger, cost_paid)
        else:
            await self._settle_not_guilty(challenge, author, challenger)

        return challenge

    # ── Settlement ────────────────────────────────────────────────────────────

    async def _settle_guilty(
        self, challenge: Challenge, author: User,
        challenger: User, content_cost: int,
    ):
        """Content violated rules — punish author, reward challenger."""
        # 1. Delete content
        if challenge.content_type == ContentType.POST.value:
            post = await self.db.get(Post, challenge.content_id)
            if post:
                post.status = PostStatus.DELETED.value
        else:
            comment = await self.db.get(Comment, challenge.content_id)
            if comment:
                await self.db.delete(comment)

        # 2. Fine the author: cost_paid × FINE_P
        fine = max(1, int(round(content_cost * FINE_P)))
        challenge.fine_amount = fine

        # Only fine if author has balance
        if author.available_balance >= fine:
            await self.ledger.spend(
                author.id, fine, ActionType.FINE,
                ref_type=RefType.CHALLENGE, ref_id=challenge.id,
                note=f'Violation fine ({fine} sat)',
            )
        else:
            # Not enough balance — charge what's possible, increase risk
            actual_fine = max(0, author.available_balance)
            if actual_fine > 0:
                await self.ledger.spend(
                    author.id, actual_fine, ActionType.FINE,
                    ref_type=RefType.CHALLENGE, ref_id=challenge.id,
                    note=f'Violation fine (partial {actual_fine}/{fine} sat)',
                )
            fine = actual_fine
            await self.trust.update_risk(author.id, 30, 'unpaid_fine')

        # 3. Refund challenger fee + reward (35% of fine)
        refund = challenge.fee_paid
        reward = int(round(fine * CHALLENGER_REWARD_PCT))
        total_challenger = refund + reward

        if total_challenger > 0:
            await self.ledger.earn(
                challenger.id, total_challenger, ActionType.CHALLENGE_REWARD,
                ref_type=RefType.CHALLENGE, ref_id=challenge.id,
                note=f'Challenge won: refund {refund} + reward {reward} sat',
            )

        # 4. Trust score updates
        await self.trust.update_creator(author.id, -30, 'content_violation')
        await self.trust.update_risk(author.id, 20, 'content_violation')
        await self.trust.update_creator(challenger.id, 5, 'successful_challenge')

    async def _settle_not_guilty(
        self, challenge: Challenge, author: User, challenger: User,
    ):
        """Content is fine — challenger loses fee, author gets vindication."""
        fee = challenge.fee_paid

        # Author gets 20% of challenger's fee
        author_share = int(round(fee * AUTHOR_VINDICATION_PCT))
        if author_share > 0:
            await self.ledger.earn(
                author.id, author_share, ActionType.CHALLENGE_REWARD,
                ref_type=RefType.CHALLENGE, ref_id=challenge.id,
                note=f'Challenge dismissed: vindication reward ({author_share} sat)',
            )

        # Trust: author gains, challenger stays neutral (no punishment for reporting)
        await self.trust.update_creator(author.id, 3, 'survived_challenge')

    # ── AI moderation ─────────────────────────────────────────────────────────

    async def _build_ai_context(
        self, author: User, content_text: str, reason: str,
    ) -> dict:
        """Build full context about the author for the AI to review."""
        # Recent posts by author (last 20)
        result = await self.db.execute(
            select(Post)
            .where(Post.author_id == author.id)
            .where(Post.status == PostStatus.ACTIVE.value)
            .order_by(desc(Post.created_at))
            .limit(20)
        )
        recent_posts = list(result.scalars().all())

        # Past challenge history
        result = await self.db.execute(
            select(Challenge)
            .where(Challenge.author_id == author.id)
            .where(Challenge.status == ChallengeStatus.GUILTY.value)
            .order_by(desc(Challenge.created_at))
            .limit(10)
        )
        past_violations = list(result.scalars().all())

        return {
            'author_profile': {
                'id': author.id,
                'name': author.name,
                'handle': author.handle,
                'bio': author.bio,
                'trust_score': author.trust_score,
                'trust_tier': trust_tier(author.trust_score),
                'creator_score': author.creator_score,
                'curator_score': author.curator_score,
                'risk_score': author.risk_score,
                'account_age_days': (datetime.utcnow() - author.created_at).days,
            },
            'recent_posts': [
                {'content': p.content[:200], 'type': p.post_type, 'likes': p.likes_count}
                for p in recent_posts
            ],
            'past_violations': len(past_violations),
            'reported_content': content_text,
            'report_reason': reason,
        }

    async def _call_ai_moderation(
        self, context: dict, content: str, reason: str,
    ) -> tuple[str, str, float]:
        """Call AI to judge the content. Returns (verdict, reason, confidence)."""
        # Try Groq first (fast), fall back to Anthropic, then rule-based
        if settings.groq_api_key:
            return await self._call_groq(context)
        if settings.anthropic_api_key:
            return await self._call_anthropic(context)
        return self._rule_based_fallback(context)

    async def _call_groq(self, context: dict) -> tuple[str, str, float]:
        """Use Groq (Llama) for fast moderation."""
        from groq import AsyncGroq

        client = AsyncGroq(api_key=settings.groq_api_key)
        prompt = self._build_prompt(context)

        response = await client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            messages=[
                {'role': 'system', 'content': self._system_prompt()},
                {'role': 'user', 'content': prompt},
            ],
            temperature=0.1,
            max_tokens=500,
        )

        return self._parse_ai_response(response.choices[0].message.content or '')

    async def _call_anthropic(self, context: dict) -> tuple[str, str, float]:
        """Use Claude for moderation."""
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        prompt = self._build_prompt(context)

        response = await client.messages.create(
            model='claude-sonnet-4-20250514',
            max_tokens=500,
            system=self._system_prompt(),
            messages=[{'role': 'user', 'content': prompt}],
        )

        text = response.content[0].text if response.content else ''
        return self._parse_ai_response(text)

    def _rule_based_fallback(
        self, context: dict,
    ) -> tuple[str, str, float]:
        """Simple rule-based fallback when no AI key is configured."""
        author = context['author_profile']
        content = context['reported_content'].lower()

        # High risk + many violations → guilty
        if author['risk_score'] > 200 and context['past_violations'] >= 2:
            return (
                ChallengeStatus.GUILTY.value,
                'High risk account with repeated violations',
                0.7,
            )

        # Spam keywords
        spam_keywords = [
            'buy now', 'free money', 'click here', 'dm me for',
            'send btc', 'guaranteed profit', 'airdrop',
        ]
        if any(kw in content for kw in spam_keywords):
            return (
                ChallengeStatus.GUILTY.value,
                f'Content contains spam indicators',
                0.6,
            )

        # Default: not guilty (conservative approach)
        return (
            ChallengeStatus.NOT_GUILTY.value,
            'No clear violation detected by automated review',
            0.5,
        )

    def _system_prompt(self) -> str:
        return (
            'You are a content moderator for BitLink, a social platform.\n'
            'You will receive a reported post/comment along with the author\'s '
            'profile, trust score, recent posts, and violation history.\n\n'
            'Platform rules — content is GUILTY if it contains:\n'
            '- Spam / advertising / low-effort promotional content\n'
            '- Scam / phishing / impersonation\n'
            '- Malware links\n'
            '- Hate speech / violence / illegal content\n'
            '- Targeted harassment / personal attacks\n\n'
            'Be CONSERVATIVE: only mark GUILTY if the violation is clear.\n'
            'Borderline content should be NOT_GUILTY.\n\n'
            'Respond in EXACTLY this format (3 lines):\n'
            'VERDICT: GUILTY or NOT_GUILTY\n'
            'CONFIDENCE: 0.0 to 1.0\n'
            'REASON: one sentence explanation'
        )

    def _build_prompt(self, context: dict) -> str:
        author = context['author_profile']
        posts = context['recent_posts']
        post_summary = '\n'.join(
            f'  - [{p["type"]}] {p["content"][:100]} (likes: {p["likes"]})'
            for p in posts[:10]
        ) or '  (no recent posts)'

        return (
            f'=== REPORTED CONTENT ===\n'
            f'{context["reported_content"]}\n\n'
            f'=== REPORT REASON ===\n'
            f'{context["report_reason"]}\n\n'
            f'=== AUTHOR PROFILE ===\n'
            f'Handle: @{author["handle"]}\n'
            f'Trust Score: {author["trust_score"]}/1000 ({author["trust_tier"]})\n'
            f'Creator Score: {author["creator_score"]}/1000\n'
            f'Risk Score: {author["risk_score"]}/1000\n'
            f'Account Age: {author["account_age_days"]} days\n'
            f'Past Violations: {context["past_violations"]}\n\n'
            f'=== RECENT POSTS ===\n'
            f'{post_summary}\n\n'
            f'Please judge: is the reported content a rule violation?'
        )

    def _parse_ai_response(
        self, text: str,
    ) -> tuple[str, str, float]:
        """Parse structured AI response into (verdict, reason, confidence)."""
        lines = text.strip().split('\n')
        verdict = ChallengeStatus.NOT_GUILTY.value
        confidence = 0.5
        reason = 'AI review completed'

        for line in lines:
            line = line.strip()
            if line.upper().startswith('VERDICT:'):
                raw = line.split(':', 1)[1].strip().upper()
                if 'GUILTY' in raw and 'NOT' not in raw:
                    verdict = ChallengeStatus.GUILTY.value
                else:
                    verdict = ChallengeStatus.NOT_GUILTY.value
            elif line.upper().startswith('CONFIDENCE:'):
                try:
                    confidence = float(line.split(':', 1)[1].strip())
                    confidence = max(0.0, min(1.0, confidence))
                except ValueError:
                    pass
            elif line.upper().startswith('REASON:'):
                reason = line.split(':', 1)[1].strip()

        return verdict, reason, confidence

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _load_content(
        self, content_type: str, content_id: int,
    ) -> tuple[str, int, int]:
        """Load content text, author_id, and cost_paid."""
        if content_type == ContentType.POST.value:
            post = await self.db.get(Post, content_id)
            if not post:
                raise ChallengeError('Post not found')
            if post.status != PostStatus.ACTIVE.value:
                raise ChallengeError('Post is not active')
            return post.content, post.author_id, post.cost_paid
        elif content_type == ContentType.COMMENT.value:
            comment = await self.db.get(Comment, content_id)
            if not comment:
                raise ChallengeError('Comment not found')
            return comment.content, comment.author_id, comment.cost_paid
        else:
            raise ChallengeError(f'Invalid content type: {content_type}')

    async def _check_window(self, content_type: str, content_id: int):
        """Ensure content is within the 7-day challenge window."""
        if content_type == ContentType.POST.value:
            post = await self.db.get(Post, content_id)
            created = post.created_at if post else None
        else:
            comment = await self.db.get(Comment, content_id)
            created = comment.created_at if comment else None

        if not created:
            raise ChallengeError('Content not found')

        deadline = created + timedelta(days=CHALLENGE_WINDOW_DAYS)
        if datetime.utcnow() > deadline:
            raise ChallengeError('Challenge window expired (>7 days)')

    async def _check_duplicate(self, content_type: str, content_id: int):
        """Prevent duplicate active challenges on the same content."""
        result = await self.db.execute(
            select(func.count(Challenge.id))
            .where(Challenge.content_type == content_type)
            .where(Challenge.content_id == content_id)
            .where(Challenge.status != ChallengeStatus.NOT_GUILTY.value)
        )
        count = result.scalar() or 0
        if count > 0:
            raise ChallengeError('Content already has an active/resolved challenge')

    async def get_challenge(self, challenge_id: int) -> Challenge | None:
        """Get a single challenge by ID."""
        return await self.db.get(Challenge, challenge_id)

    async def get_challenges_for_content(
        self, content_type: str, content_id: int,
    ) -> list[Challenge]:
        """Get all challenges for a piece of content."""
        result = await self.db.execute(
            select(Challenge)
            .where(Challenge.content_type == content_type)
            .where(Challenge.content_id == content_id)
            .order_by(desc(Challenge.created_at))
        )
        return list(result.scalars().all())

    async def get_user_challenges(
        self, user_id: int, role: str = 'challenger',
        limit: int = 20, offset: int = 0,
    ) -> list[Challenge]:
        """Get challenges by or against a user."""
        col = Challenge.challenger_id if role == 'challenger' else Challenge.author_id
        result = await self.db.execute(
            select(Challenge)
            .where(col == user_id)
            .order_by(desc(Challenge.created_at))
            .limit(limit).offset(offset)
        )
        return list(result.scalars().all())
