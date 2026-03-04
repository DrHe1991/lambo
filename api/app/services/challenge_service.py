"""
Challenge Service - Multi-layer arbitration system

L1 (100 sat): AI automatic judgment
L2 (500 sat): Community jury (5 jurors)
L3 (1500 sat): Committee review (future)

Fine distribution: 35% reporter, 25% jury, 40% platform
"""
from datetime import datetime, timedelta
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.post import Post, Comment
from app.models.challenge import (
    Challenge, JuryVote, ChallengeStatus, ContentType, ViolationType,
    LAYER_FEES, VIOLATION_MULTIPLIERS, BASE_FINE,
    FINE_TO_REPORTER, FINE_TO_JURY, FINE_TO_PLATFORM,
)
from app.models.ledger import Ledger, ActionType, RefType
from app.models.revenue import PlatformRevenue
from app.services.trust_service import TrustScoreService, compute_trust_score

# AI confidence threshold for auto-resolution
AI_CONFIDENCE_THRESHOLD = 0.85
# Jury voting period
JURY_VOTING_HOURS = 48
# Minimum jury size
MIN_JURY_SIZE = 5
# Minimum trust for jurors
MIN_JUROR_TRUST = 400


class ChallengeService:
    """Handles challenge creation, voting, and resolution."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_challenge(
        self,
        challenger_id: int,
        content_type: str,
        content_id: int,
        reason: str,
        violation_type: str = ViolationType.LOW_QUALITY.value,
        layer: int = 1,
    ) -> dict:
        """Create a new challenge (report) for content."""
        challenger = await self.db.get(User, challenger_id)
        if not challenger:
            return {'error': 'Challenger not found'}

        # Get content and author
        if content_type == ContentType.POST.value:
            content = await self.db.get(Post, content_id)
        else:
            content = await self.db.get(Comment, content_id)

        if not content:
            return {'error': 'Content not found'}

        author_id = content.author_id

        # Check fee
        fee = LAYER_FEES.get(layer, 100)
        if challenger.available_balance < fee:
            return {'error': 'Insufficient balance', 'required': fee}

        # Deduct fee
        challenger.available_balance -= fee
        self.db.add(Ledger(
            user_id=challenger_id,
            amount=-fee,
            balance_after=challenger.available_balance,
            action_type=ActionType.CHALLENGE_FEE.value,
            ref_type=RefType.CHALLENGE.value,
            note=f'L{layer} challenge fee',
        ))

        # Create challenge
        challenge = Challenge(
            content_type=content_type,
            content_id=content_id,
            challenger_id=challenger_id,
            author_id=author_id,
            reason=reason,
            violation_type=violation_type,
            layer=layer,
            fee_paid=fee,
            status=ChallengeStatus.PENDING.value,
        )
        self.db.add(challenge)
        await self.db.flush()

        # Auto-process L1
        if layer == 1:
            result = await self._process_l1(challenge)
            return {**result, 'challenge_id': challenge.id}

        # L2: Start jury selection
        if layer == 2:
            await self._start_jury_voting(challenge)
            return {
                'challenge_id': challenge.id,
                'status': 'voting',
                'jury_size': challenge.jury_size,
                'voting_deadline': challenge.voting_deadline.isoformat(),
            }

        return {'challenge_id': challenge.id, 'status': challenge.status}

    async def _process_l1(self, challenge: Challenge) -> dict:
        """Process L1 (AI) challenge."""
        # Simulate AI verdict (in production, call actual AI service)
        # For now, use simple heuristics based on reason
        ai_verdict, confidence = self._simulate_ai_verdict(challenge.reason)

        challenge.ai_verdict = ai_verdict
        challenge.ai_confidence = confidence
        challenge.ai_reason = f'AI determined: {ai_verdict} ({confidence:.0%} confidence)'

        if confidence >= AI_CONFIDENCE_THRESHOLD:
            # High confidence - auto resolve
            if ai_verdict == 'guilty':
                await self._apply_guilty_verdict(challenge)
            else:
                await self._apply_not_guilty_verdict(challenge)

            return {
                'verdict': challenge.status,
                'ai_confidence': confidence,
                'fine_amount': challenge.fine_amount,
            }
        else:
            # Low confidence - escalate to L2
            challenge.status = ChallengeStatus.ESCALATED.value
            challenge.layer = 2
            await self._start_jury_voting(challenge)

            return {
                'status': 'escalated',
                'ai_confidence': confidence,
                'reason': 'Low AI confidence, escalated to community jury',
            }

    def _simulate_ai_verdict(self, reason: str) -> tuple[str, float]:
        """Simulate AI verdict based on reason keywords."""
        reason_lower = reason.lower()

        # High confidence guilty
        if any(w in reason_lower for w in ['scam', 'fraud', 'phishing', 'malware']):
            return 'guilty', 0.95
        if any(w in reason_lower for w in ['spam', 'ad', 'promotion', 'advertis']):
            return 'guilty', 0.88
        if any(w in reason_lower for w in ['copy', 'plagiar', 'stolen']):
            return 'guilty', 0.82

        # Low quality - medium confidence
        if any(w in reason_lower for w in ['low quality', 'meaningless', 'clickbait']):
            return 'guilty', 0.70

        # Default - uncertain
        return 'not_guilty', 0.60

    async def _start_jury_voting(self, challenge: Challenge):
        """Initialize L2 jury voting."""
        challenge.status = ChallengeStatus.VOTING.value
        challenge.voting_deadline = datetime.utcnow() + timedelta(hours=JURY_VOTING_HOURS)
        challenge.jury_size = MIN_JURY_SIZE
        await self.db.flush()

    async def cast_jury_vote(
        self,
        challenge_id: int,
        juror_id: int,
        vote_guilty: bool,
        reasoning: str = None,
    ) -> dict:
        """Cast a jury vote on a L2/L3 challenge."""
        challenge = await self.db.get(Challenge, challenge_id)
        if not challenge:
            return {'error': 'Challenge not found'}

        if challenge.status != ChallengeStatus.VOTING.value:
            return {'error': f'Challenge not in voting state: {challenge.status}'}

        juror = await self.db.get(User, juror_id)
        if not juror:
            return {'error': 'Juror not found'}

        # Check juror eligibility
        if juror.trust_score < MIN_JUROR_TRUST:
            return {'error': f'Insufficient trust score (need {MIN_JUROR_TRUST})'}

        # Check not already voted
        existing = await self.db.execute(
            select(JuryVote).where(
                JuryVote.challenge_id == challenge_id,
                JuryVote.juror_id == juror_id,
            )
        )
        if existing.scalar_one_or_none():
            return {'error': 'Already voted on this challenge'}

        # Can't vote on own content or own challenge
        if juror_id in (challenge.challenger_id, challenge.author_id):
            return {'error': 'Cannot vote on challenge you are involved in'}

        # Cast vote
        vote = JuryVote(
            challenge_id=challenge_id,
            juror_id=juror_id,
            vote_guilty=vote_guilty,
            reasoning=reasoning,
        )
        self.db.add(vote)

        if vote_guilty:
            challenge.votes_guilty += 1
        else:
            challenge.votes_not_guilty += 1

        await self.db.flush()

        # Check if voting complete
        total_votes = challenge.votes_guilty + challenge.votes_not_guilty
        if total_votes >= challenge.jury_size:
            await self._resolve_jury_verdict(challenge)

        return {
            'vote_recorded': True,
            'current_votes': total_votes,
            'required_votes': challenge.jury_size,
            'status': challenge.status,
        }

    async def _resolve_jury_verdict(self, challenge: Challenge):
        """Resolve challenge based on jury votes."""
        # Simple majority
        if challenge.votes_guilty > challenge.votes_not_guilty:
            await self._apply_guilty_verdict(challenge)
            majority_guilty = True
        else:
            await self._apply_not_guilty_verdict(challenge)
            majority_guilty = False

        # Update juror rewards and trust
        result = await self.db.execute(
            select(JuryVote).where(JuryVote.challenge_id == challenge.id)
        )
        votes = list(result.scalars().all())

        # Reward per correct juror
        reward_per_juror = challenge.jury_reward // max(1, len([v for v in votes if v.vote_guilty == majority_guilty]))

        trust_svc = TrustScoreService(self.db)
        for vote in votes:
            voted_correctly = vote.vote_guilty == majority_guilty
            vote.voted_with_majority = voted_correctly

            juror = await self.db.get(User, vote.juror_id)
            if not juror:
                continue

            if voted_correctly:
                # Reward correct voters
                vote.reward_amount = reward_per_juror
                juror.available_balance += reward_per_juror

                self.db.add(Ledger(
                    user_id=juror.id,
                    amount=reward_per_juror,
                    balance_after=juror.available_balance,
                    action_type=ActionType.JURY_REWARD.value,
                    ref_type=RefType.CHALLENGE.value,
                    ref_id=challenge.id,
                    note='Jury reward for correct vote',
                ))

                # Increase Juror score
                await trust_svc.update_juror(juror.id, 15, 'correct_jury_vote')
            else:
                # Decrease Juror score for wrong vote
                await trust_svc.update_juror(juror.id, -10, 'incorrect_jury_vote')

        await self.db.flush()

    async def _apply_guilty_verdict(self, challenge: Challenge):
        """Apply guilty verdict - penalize author, reward reporter."""
        challenge.status = ChallengeStatus.GUILTY.value
        challenge.resolved_at = datetime.utcnow()

        # Calculate fine
        multiplier = VIOLATION_MULTIPLIERS.get(challenge.violation_type, 1.0)
        fine = int(BASE_FINE * multiplier)
        challenge.fine_amount = fine

        # Distribute fine
        reporter_share = int(fine * FINE_TO_REPORTER)
        jury_share = int(fine * FINE_TO_JURY)
        platform_share = fine - reporter_share - jury_share

        challenge.reporter_reward = reporter_share
        challenge.jury_reward = jury_share
        challenge.platform_share = platform_share

        # Penalize author
        author = await self.db.get(User, challenge.author_id)
        if author:
            # Deduct fine (can go negative)
            author.available_balance -= fine
            self.db.add(Ledger(
                user_id=author.id,
                amount=-fine,
                balance_after=author.available_balance,
                action_type=ActionType.FINE.value,
                ref_type=RefType.CHALLENGE.value,
                ref_id=challenge.id,
                note=f'Fine for {challenge.violation_type}',
            ))

            # Update trust scores
            trust_svc = TrustScoreService(self.db)
            await trust_svc.update_creator(author.id, -50, 'content_violation')
            await trust_svc.update_risk(author.id, 30, 'content_violation')

        # Reward reporter
        reporter = await self.db.get(User, challenge.challenger_id)
        if reporter:
            reporter.available_balance += reporter_share + challenge.fee_paid  # Refund fee too
            self.db.add(Ledger(
                user_id=reporter.id,
                amount=reporter_share + challenge.fee_paid,
                balance_after=reporter.available_balance,
                action_type=ActionType.CHALLENGE_REWARD.value,
                ref_type=RefType.CHALLENGE.value,
                ref_id=challenge.id,
                note='Reporter reward + fee refund',
            ))

            # Update trust
            trust_svc = TrustScoreService(self.db)
            await trust_svc.update_juror(reporter.id, 10, 'successful_report')

        # Record platform revenue
        await self._record_platform_revenue(platform_share)

        await self.db.flush()

    async def _apply_not_guilty_verdict(self, challenge: Challenge):
        """Apply not guilty verdict - penalize reporter (loses fee)."""
        challenge.status = ChallengeStatus.NOT_GUILTY.value
        challenge.resolved_at = datetime.utcnow()

        # Reporter loses fee (already deducted)
        # Update reporter trust
        reporter = await self.db.get(User, challenge.challenger_id)
        if reporter:
            trust_svc = TrustScoreService(self.db)
            await trust_svc.update_risk(reporter.id, 5, 'failed_report')

        # Fee goes to platform
        await self._record_platform_revenue(challenge.fee_paid)

        await self.db.flush()

    async def get_challenge(self, challenge_id: int) -> dict | None:
        """Get challenge details."""
        challenge = await self.db.get(Challenge, challenge_id)
        if not challenge:
            return None

        return {
            'id': challenge.id,
            'content_type': challenge.content_type,
            'content_id': challenge.content_id,
            'challenger_id': challenge.challenger_id,
            'author_id': challenge.author_id,
            'reason': challenge.reason,
            'violation_type': challenge.violation_type,
            'layer': challenge.layer,
            'status': challenge.status,
            'fee_paid': challenge.fee_paid,
            'fine_amount': challenge.fine_amount,
            'ai_verdict': challenge.ai_verdict,
            'ai_confidence': challenge.ai_confidence,
            'votes_guilty': challenge.votes_guilty,
            'votes_not_guilty': challenge.votes_not_guilty,
            'voting_deadline': challenge.voting_deadline.isoformat() if challenge.voting_deadline else None,
            'created_at': challenge.created_at.isoformat(),
            'resolved_at': challenge.resolved_at.isoformat() if challenge.resolved_at else None,
        }

    async def _record_platform_revenue(self, amount: int):
        """Record challenge revenue for today."""
        from datetime import date as date_type
        today = date_type.today()
        result = await self.db.execute(
            select(PlatformRevenue).where(PlatformRevenue.date == today)
        )
        rev = result.scalar_one_or_none()
        if rev:
            rev.challenge_revenue += amount
            rev.total += amount
        else:
            self.db.add(PlatformRevenue(
                date=today,
                challenge_revenue=amount,
                total=amount,
            ))
        await self.db.flush()

    async def get_pending_jury_challenges(self, juror_id: int) -> list:
        """Get challenges available for a juror to vote on."""
        juror = await self.db.get(User, juror_id)
        if not juror or juror.trust_score < MIN_JUROR_TRUST:
            return []

        # Get voting challenges where user hasn't voted
        result = await self.db.execute(
            select(Challenge)
            .where(
                Challenge.status == ChallengeStatus.VOTING.value,
                Challenge.challenger_id != juror_id,
                Challenge.author_id != juror_id,
            )
        )
        challenges = list(result.scalars().all())

        # Filter out already voted
        pending = []
        for c in challenges:
            voted = await self.db.execute(
                select(JuryVote).where(
                    JuryVote.challenge_id == c.id,
                    JuryVote.juror_id == juror_id,
                )
            )
            if not voted.scalar_one_or_none():
                pending.append({
                    'id': c.id,
                    'content_type': c.content_type,
                    'content_id': c.content_id,
                    'reason': c.reason,
                    'votes_guilty': c.votes_guilty,
                    'votes_not_guilty': c.votes_not_guilty,
                    'voting_deadline': c.voting_deadline.isoformat() if c.voting_deadline else None,
                })

        return pending
