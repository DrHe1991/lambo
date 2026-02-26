"""
BitLink Economic Simulator - Core Engine
Handles fees, rewards, discovery score calculation
"""

import random
import uuid
from typing import List, Dict, Optional, Tuple
from collections import defaultdict

from config import (
    # Constants
    DAILY_PLATFORM_SUBSIDY, REWARD_SETTLEMENT_DAYS, CHALLENGE_WINDOW_DAYS,
    AUTHOR_REWARD_RATIO, COMMENT_POOL_RATIO, HUMAN_PLEDGE_BONUS, HUMAN_PLEDGE_PENALTY_MULT,
    BASE_POOL_RATIO, PERF_POOL_RATIO,
    # Quality inference bonuses
    COMMENT_BONUS_MAX, COMMENT_BONUS_THRESHOLD, AUTHOR_TRUST_BONUS_MAX,
    # Costs
    C_POST, C_QUESTION, C_ANSWER, C_COMMENT, C_REPLY, C_LIKE, C_COMMENT_LIKE,
    F_L1, F_L2, F_L3,
    # Discovery weights
    W_TRUST, get_n_novelty, S_SOURCE, CE_ENTROPY, get_scout_multiplier,
    # Reputation
    REPUTATION_EVENTS, PENALTY_MULTIPLIERS, CHALLENGE_DISTRIBUTION,
    TIER_REWARD_MULTIPLIER,
    # Types
    TrustTier, UserType, get_trust_tier, IP_WEIGHTS,
    # Anti-manipulation parameters
    AUDIENCE_QUALITY_THRESHOLD, AUDIENCE_QUALITY_WEIGHT,
    CABAL_DETECTION_RISK_THRESHOLD, CABAL_PENALTY_MULTIPLIER, CABAL_PENALTY_DURATION_DAYS,
    VIOLATION_LIKE_PENALTY,
    # Circle limit and detection params
    CIRCLE_SIZE, DAILY_CIRCLE_CONTRIBUTION_LIMIT,
    CABAL_DETECTION_RATIO, CABAL_ASSET_SEIZURE_BASE, CABAL_MAX_SEIZURE_RATE,
    # NEW: Gradual suspicion params
    CABAL_SUSPICION_RATIO_THRESHOLD, CABAL_SUSPICION_WEIGHT_PENALTY, CABAL_VOLUME_THRESHOLD,
)
from models import (
    User, Content, ContentType, ContentStatus, Like, Challenge,
    ChallengeStatus, ChallengeVerdict, Cabal, SimulationState, DailyMetrics
)


class EconomicEngine:
    """Handles all economic calculations"""
    
    def __init__(self, state: SimulationState):
        self.state = state
        # Track daily circle contributions per user
        # Format: {user_id: {day: total_contribution}}
        self.circle_contributions: Dict[str, Dict[int, float]] = defaultdict(lambda: defaultdict(float))
        
        # PERFORMANCE: Cache suspicion scores (recalculated daily)
        self._suspicion_cache: Dict[str, float] = {}
        self._suspicion_cache_day: int = -1
        
        # PERFORMANCE: Cache user circles (recalculated daily)
        self._circle_cache: Dict[str, set] = {}
        self._circle_cache_day: int = -1
    
    def reset_daily_contributions(self, day: int):
        """Reset circle contributions for a new day (cleanup old days)"""
        # Invalidate caches for new day
        if day != self._suspicion_cache_day:
            self._suspicion_cache.clear()
            self._suspicion_cache_day = day
        if day != self._circle_cache_day:
            self._circle_cache.clear()
            self._circle_cache_day = day
        
        # Cleanup old contribution data
        for user_id in list(self.circle_contributions.keys()):
            old_days = [d for d in self.circle_contributions[user_id].keys() if d < day - 1]
            for old_day in old_days:
                del self.circle_contributions[user_id][old_day]
    
    def get_user_circle(self, user: User) -> set:
        """Get user's primary circle (top N interactors) - CACHED"""
        if user.id in self._circle_cache:
            return self._circle_cache[user.id]
        
        sorted_interactions = sorted(
            user.interaction_history.items(),
            key=lambda x: x[1],
            reverse=True
        )
        circle = set([uid for uid, count in sorted_interactions[:CIRCLE_SIZE]])
        self._circle_cache[user.id] = circle
        return circle
    
    def calculate_user_suspicion(self, user: User) -> float:
        """Calculate user's suspicion score - CACHED"""
        if user.id in self._suspicion_cache:
            return self._suspicion_cache[user.id]
        
        total_interactions = sum(user.interaction_history.values())
        
        # Need enough data to judge
        if total_interactions < 20:
            self._suspicion_cache[user.id] = 0.0
            return 0.0
        
        # Get top N interactors
        sorted_interactions = sorted(
            user.interaction_history.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        # Calculate interaction concentration in top N
        top_n = min(CIRCLE_SIZE, len(sorted_interactions))
        circle_interactions = sum(count for _, count in sorted_interactions[:top_n])
        
        concentration = circle_interactions / total_interactions
        
        # Suspicion formula
        if concentration <= 0.5:
            suspicion = 0.0
        else:
            suspicion = min(0.9, (concentration - 0.5) * 2)
        
        # Additional factor: high volume
        if top_n >= 3:
            avg_per_top = circle_interactions / top_n
            if avg_per_top > CABAL_VOLUME_THRESHOLD:
                volume_boost = min(0.1, (avg_per_top - CABAL_VOLUME_THRESHOLD) / 100)
                suspicion = min(0.95, suspicion + volume_boost)
        
        self._suspicion_cache[user.id] = suspicion
        return suspicion
    
    # =========================================================================
    # Fee Calculations
    # =========================================================================
    
    def get_dynamic_multiplier(self) -> float:
        """M(SI) = 1 + 3 * SI"""
        return 1 + 3 * self.state.spam_index
    
    def calculate_action_cost(self, user: User, base_cost: float) -> float:
        """Calculate actual cost after M and K adjustments"""
        m = self.get_dynamic_multiplier()
        k = user.k_factor
        return base_cost * m * k
    
    def get_post_cost(self, user: User) -> float:
        return self.calculate_action_cost(user, C_POST)
    
    def get_comment_cost(self, user: User) -> float:
        return self.calculate_action_cost(user, C_COMMENT)
    
    def get_like_cost(self, user: User) -> float:
        return self.calculate_action_cost(user, C_LIKE)
    
    def get_challenge_cost(self, user: User, layer: int) -> float:
        base = [F_L1, F_L2, F_L3][layer - 1]
        return base * user.k_factor  # Only K, not M
    
    # =========================================================================
    # Discovery Score Calculation
    # =========================================================================
    
    def calculate_like_weight(
        self,
        liker: User,
        author: User,
        content: Content,
        like_order: int,
        current_day: int = 0
    ) -> Tuple[float, float, float, float, float, float]:
        """
        Calculate all components of a like's weight.
        Returns: (w_trust, n_novelty, s_source, ce_entropy, scout_mult, combined_penalty_mult)
        """
        # W_trust based on liker's trust tier
        w_trust = W_TRUST.get(liker.trust_tier, 0.5)
        
        # N_novelty based on interaction history
        interaction_count = liker.get_interaction_count(author.id)
        n_novelty = get_n_novelty(interaction_count)
        
        # S_source based on follow relationship
        if author.id in liker.following:
            s_source = S_SOURCE['follower']
        else:
            s_source = S_SOURCE['stranger']
        
        # CE_entropy based on social distance
        ce_entropy = self._calculate_ce_entropy(liker, author)
        
        # Scout multiplier based on like timing
        scout_mult = get_scout_multiplier(like_order)
        
        # === PENALTY MULTIPLIERS ===
        
        # 1. Circle contribution limit
        circle_limit_mult = 1.0
        liker_circle = self.get_user_circle(liker)
        
        if author.id in liker_circle:
            # Author is in liker's circle - check daily limit
            today_contribution = self.circle_contributions[liker.id][current_day]
            
            # Calculate base weight
            base_weight = w_trust * n_novelty * s_source * ce_entropy * scout_mult
            
            if today_contribution >= DAILY_CIRCLE_CONTRIBUTION_LIMIT:
                # Over limit - zero contribution
                circle_limit_mult = 0.0
            elif today_contribution + base_weight > DAILY_CIRCLE_CONTRIBUTION_LIMIT:
                # Partial contribution
                remaining = DAILY_CIRCLE_CONTRIBUTION_LIMIT - today_contribution
                circle_limit_mult = remaining / base_weight
                self.circle_contributions[liker.id][current_day] = DAILY_CIRCLE_CONTRIBUTION_LIMIT
            else:
                # Full contribution
                self.circle_contributions[liker.id][current_day] += base_weight
        
        # 2. Gradual suspicion penalty for LIKER (A3)
        liker_suspicion = self.calculate_user_suspicion(liker)
        liker_suspicion_mult = 1.0 - (liker_suspicion * CABAL_SUSPICION_WEIGHT_PENALTY)
        
        # 3. NEW: Gradual suspicion penalty for AUTHOR (content creator)
        # If author is suspicious, likes TO their content are also devalued
        author_suspicion = self.calculate_user_suspicion(author)
        author_suspicion_mult = 1.0 - (author_suspicion * CABAL_SUSPICION_WEIGHT_PENALTY * 0.7)
        
        # Combined penalty
        combined_penalty = circle_limit_mult * liker_suspicion_mult * author_suspicion_mult
        
        return (w_trust, n_novelty, s_source, ce_entropy, scout_mult, combined_penalty)
    
    def _calculate_ce_entropy(self, liker: User, author: User) -> float:
        """Calculate consensus entropy between two users"""
        # Check if in same cabal
        if (liker.cabal_id is not None and 
            liker.cabal_id == author.cabal_id):
            return CE_ENTROPY['cabal_mutual']
        
        # Check mutual interaction frequency
        mutual_interactions = (
            liker.get_interaction_count(author.id) +
            author.get_interaction_count(liker.id)
        )
        if mutual_interactions > 20:
            return CE_ENTROPY['cabal_mutual']
        elif mutual_interactions > 10:
            return CE_ENTROPY['high_frequency_friend']
        
        # Check co-following overlap
        common_following = liker.following & author.following
        if len(liker.following) > 0:
            overlap_ratio = len(common_following) / len(liker.following)
            if overlap_ratio > 0.5:
                return CE_ENTROPY['high_frequency_friend']
            elif overlap_ratio > 0.2:
                return CE_ENTROPY['same_channel']
        
        # Different circles = high entropy
        if liker.user_type != author.user_type:
            return CE_ENTROPY['cross_channel']
        
        return CE_ENTROPY['same_channel']
    
    # =========================================================================
    # Reward Settlement
    # =========================================================================
    
    def settle_rewards(self, day: int, daily_active_users: int = 0):
        """
        DEPRECATED: Reward pool distribution is disabled.
        Revenue now flows directly: 50% to creator on each like, 50% to platform.
        This method only marks content as settled.
        """
        if day not in self.state.pending_settlements:
            return
        
        # Just mark content as settled, no reward distribution
        for cid in self.state.pending_settlements[day]:
            if cid in self.state.content:
                self.state.content[cid].status = ContentStatus.SETTLED
        del self.state.pending_settlements[day]
        return
        
    
    def _apply_content_reputation_fast(self, content: Content, ranks: dict, total: int):
        """Apply reputation changes using pre-calculated ranks"""
        author = self.state.users.get(content.author_id)
        if not author:
            return
        
        rank = ranks.get(content.id, total)
        percentile = rank / total
        
        # 获取作者的等级递减乘数
        tier_mult = TIER_REWARD_MULTIPLIER.get(author.trust_tier, 1.0)
        
        event = REPUTATION_EVENTS['post_settled_no_violation']
        change = random.uniform(event.min_change, event.max_change)
        author.reputation.apply_change(event.dimension, change, tier_mult)
        
        if percentile <= 0.01:
            event = REPUTATION_EVENTS['post_top_1_percent']
            change = random.uniform(event.min_change, event.max_change)
            author.reputation.apply_change(event.dimension, change, tier_mult)
            self._reward_early_likers(content, 'top_1')
        elif percentile <= 0.10:
            event = REPUTATION_EVENTS['post_top_10_percent']
            change = random.uniform(event.min_change, event.max_change)
            author.reputation.apply_change(event.dimension, change, tier_mult)
            self._reward_early_likers(content, 'top_10')
    
    def _reward_early_likers(self, content: Content, tier: str):
        """Reward users who liked content early"""
        for i, like in enumerate(content.likes[:10]):  # First 10 likers
            user = self.state.users.get(like.user_id)
            if user:
                # 获取点赞者的等级递减乘数
                tier_mult = TIER_REWARD_MULTIPLIER.get(user.trust_tier, 1.0)
                
                if tier == 'top_1':
                    event = REPUTATION_EVENTS['liked_top_1']
                else:
                    event = REPUTATION_EVENTS['liked_top_10']
                change = random.uniform(event.min_change, event.max_change)
                change *= like.scout_mult  # Scale by scout multiplier
                user.reputation.apply_change(event.dimension, change, tier_mult)
                user.scout_score += change * tier_mult
    
    def _distribute_comment_rewards(self, content: Content, pool: float):
        """Distribute comment pool to commenters"""
        if not content.comments:
            # No comments, give to author
            author = self.state.users.get(content.author_id)
            if author:
                author.earn(pool)
            return
        
        # Get comments and their scores
        comments = [
            self.state.content.get(cid) for cid in content.comments
            if cid in self.state.content
        ]
        comments = [c for c in comments if c is not None]
        
        if not comments:
            author = self.state.users.get(content.author_id)
            if author:
                author.earn(pool)
            return
        
        total_comment_score = sum(c.discovery_score for c in comments)
        if total_comment_score == 0:
            author = self.state.users.get(content.author_id)
            if author:
                author.earn(pool)
            return
        
        for comment in comments:
            share = comment.discovery_score / total_comment_score
            reward = share * pool
            commenter = self.state.users.get(comment.author_id)
            if commenter:
                commenter.earn(reward)
                comment.reward_earned = reward
    
    # =========================================================================
    # Influence Calculations
    # =========================================================================
    
    def calculate_influence_breadth(self, user: User) -> float:
        """Calculate user's influence index"""
        total = 0.0
        for follower_id in user.followers:
            follower = self.state.users.get(follower_id)
            if follower:
                total += IP_WEIGHTS.get(follower.trust_tier, 1)
        return total
    
    def calculate_influence_depth(self, user: User) -> float:
        """Calculate user's influence depth (purity)"""
        if len(user.followers) == 0:
            return 0.0
        breadth = self.calculate_influence_breadth(user)
        return breadth / len(user.followers)
    
    def calculate_influence_percentiles(self) -> Dict[str, Tuple[float, float]]:
        """Calculate percentile rankings for all users"""
        breadths = []
        depths = []
        
        for user in self.state.users.values():
            b = self.calculate_influence_breadth(user)
            d = self.calculate_influence_depth(user)
            breadths.append((user.id, b))
            depths.append((user.id, d))
        
        breadths.sort(key=lambda x: x[1], reverse=True)
        depths.sort(key=lambda x: x[1], reverse=True)
        
        result = {}
        for i, (uid, _) in enumerate(breadths):
            breadth_pct = (i + 1) / len(breadths)
            result[uid] = (breadth_pct, 0)
        
        for i, (uid, _) in enumerate(depths):
            depth_pct = (i + 1) / len(depths)
            if uid in result:
                result[uid] = (result[uid][0], depth_pct)
            else:
                result[uid] = (1.0, depth_pct)
        
        return result
    
    # =========================================================================
    # Spam Index Update
    # =========================================================================
    
    def update_spam_index(self):
        """Update SI based on recent platform activity"""
        recent_content = self.state.get_content_by_day_range(
            self.state.current_day - 7, 
            self.state.current_day
        )
        
        if not recent_content:
            self.state.spam_index = 0
            return
        
        # Calculate violation rate
        violations = sum(1 for c in recent_content if c.is_violation)
        violation_rate = violations / len(recent_content)
        
        # Calculate new account post ratio
        new_account_posts = sum(
            1 for c in recent_content 
            if self.state.users.get(c.author_id) and 
            self.state.users[c.author_id].account_age < 7
        )
        new_account_ratio = new_account_posts / len(recent_content)
        
        # Simple SI calculation
        self.state.spam_index = min(1.0, (violation_rate + new_account_ratio) / 2)


class ChallengeEngine:
    """Handles challenge resolution"""
    
    def __init__(self, state: SimulationState):
        self.state = state
    
    def resolve_challenge(self, challenge: Challenge) -> bool:
        """Resolve a challenge. Returns True if violation found."""
        content = self.state.content.get(challenge.content_id)
        if not content:
            return False
        
        # AI judgment (Layer 1) - based on actual content quality
        is_violation = content.is_violation
        
        challenge.verdict = (
            ChallengeVerdict.GUILTY if is_violation 
            else ChallengeVerdict.NOT_GUILTY
        )
        challenge.status = ChallengeStatus.RESOLVED_L1
        
        # Process settlement
        self._settle_challenge(challenge, is_violation)
        
        return is_violation
    
    def _settle_challenge(self, challenge: Challenge, is_violation: bool):
        """Settle challenge economics and reputation"""
        content = self.state.content.get(challenge.content_id)
        author = self.state.users.get(challenge.author_id)
        challenger = self.state.users.get(challenge.challenger_id)
        
        if not content or not author or not challenger:
            return
        
        if is_violation:
            # === GUILTY ===
            content.status = ContentStatus.REMOVED
            
            # Calculate penalty
            base_penalty = content.cost_paid
            violation_mult = PENALTY_MULTIPLIERS.get(
                content.violation_type or 'low_quality', 0.5
            )
            
            # Human pledge doubles penalty
            if content.human_pledge:
                violation_mult *= HUMAN_PLEDGE_PENALTY_MULT
            
            penalty = base_penalty * violation_mult
            challenge.penalty_amount = penalty
            
            # Author pays penalty (may be less than penalty if insufficient balance)
            balance_before = author.balance
            author.penalize(penalty)
            actual_penalty = balance_before - author.balance
            author.violations_committed += 1
            
            # === 无条件涨 Risk（核心修复）===
            base_risk_increase = 30
            recidivism_bonus = 15 * min(author.violations_committed, 5)
            risk_increase = base_risk_increase + recidivism_bonus
            author.reputation.apply_change('risk', risk_increase)
            
            # Author reputation hit (creator 维度)
            event = REPUTATION_EVENTS['content_violation']
            change = random.uniform(event.min_change, event.max_change)
            if content.human_pledge:
                change *= HUMAN_PLEDGE_PENALTY_MULT
            author.reputation.apply_change(event.dimension, change)
            
            # Distribute rewards based on ACTUAL penalty collected (not requested)
            challenger_reward = actual_penalty * CHALLENGE_DISTRIBUTION['challenger_reward']
            jury_reward = actual_penalty * CHALLENGE_DISTRIBUTION.get('jury_reward', 0.0)
            pool_reward = actual_penalty * CHALLENGE_DISTRIBUTION['pool_reward']
            
            # Refund challenger fee + reward
            challenger.earn(challenge.l1_fee + challenger_reward)
            challenger.challenges_won += 1
            challenge.challenger_reward = challenger_reward
            challenge.jury_reward = jury_reward
            
            # L1 has no jury assignment, so jury share is redirected to pool.
            total_pool_reward = pool_reward + jury_reward
            self.state.reward_pool += total_pool_reward
            challenge.pool_contribution = total_pool_reward
            
            # Penalize likers (reputation only)
            for like in content.likes:
                liker = self.state.users.get(like.user_id)
                if liker:
                    event = REPUTATION_EVENTS['liked_violation']
                    change = random.uniform(event.min_change, event.max_change)
                    liker.reputation.apply_change(event.dimension, change)
        
        else:
            # === NOT GUILTY ===
            # Challenger loses fee
            challenger.challenges_lost += 1
            
            # Author gets compensation
            compensation = challenge.l1_fee * 0.20
            author.earn(compensation)
            
            # Author reputation boost (应用等级递减)
            tier_mult = TIER_REWARD_MULTIPLIER.get(author.trust_tier, 1.0)
            event = REPUTATION_EVENTS['content_cleared']
            change = random.uniform(event.min_change, event.max_change)
            author.reputation.apply_change(event.dimension, change, tier_mult)
            
            # Keep fee distribution fully conserved.
            pool_share = challenge.l1_fee * 0.50
            residual_share = max(0.0, challenge.l1_fee - compensation - pool_share)
            total_pool_share = pool_share + residual_share
            self.state.reward_pool += total_pool_share
            challenge.pool_contribution = total_pool_share
    
    def detect_cabal_activity(self):
        """Detect organized manipulation groups"""
        # Find users with suspiciously high mutual interaction
        for cabal in self.state.cabals.values():
            if cabal.detected:
                continue
            
            # Check if cabal members have unusual patterns
            members = [self.state.users.get(uid) for uid in cabal.member_ids]
            members = [m for m in members if m is not None]
            
            if len(members) < 3:
                continue
            
            # Calculate internal vs external interaction ratio
            total_internal = 0
            total_external = 0
            
            for member in members:
                for other_id, count in member.interaction_history.items():
                    if other_id in cabal.member_ids:
                        total_internal += count
                    else:
                        total_external += count
            
            ratio = total_internal / max(total_external, 1)
            
            # Check detection conditions
            ratio_trigger = ratio > CABAL_DETECTION_RATIO
            
            # Also trigger on high volume (A2 enhancement)
            avg_internal_per_member = total_internal / len(members)
            volume_trigger = avg_internal_per_member > CABAL_VOLUME_THRESHOLD
            
            if ratio_trigger or volume_trigger:
                # Detected!
                cabal.detected = True
                cabal.detection_day = self.state.current_day
                
                # Calculate dynamic seizure rate (B2)
                # Higher ratio = higher seizure
                ratio_multiplier = min(2.0, ratio / CABAL_DETECTION_RATIO)
                # Longer active = higher seizure
                days_active = max(1, self.state.current_day - 1)  # Approx
                duration_multiplier = min(1.5, days_active / 30)
                
                dynamic_seizure_rate = min(
                    CABAL_MAX_SEIZURE_RATE,
                    CABAL_ASSET_SEIZURE_BASE * ratio_multiplier * duration_multiplier
                )
                
                # Slash all members - reputation, behavior penalty, AND asset seizure
                for member in members:
                    event = REPUTATION_EVENTS['cabal_primary']
                    change = random.uniform(event.min_change, event.max_change)
                    member.reputation.apply_change('risk', change)
                    
                    # CRITICAL: Also slash Creator score (they gamed it via mutual liking)
                    # Reduce Creator by 50-80% to undo the manipulation gains
                    creator_slash = member.reputation.creator * random.uniform(0.5, 0.8)
                    member.reputation.creator = max(100, member.reputation.creator - creator_slash)
                    
                    # Also slash Curator score (they gave fake likes)
                    curator_slash = member.reputation.curator * random.uniform(0.3, 0.5)
                    member.reputation.curator = max(100, member.reputation.curator - curator_slash)
                    
                    # Apply behavior penalty (future actions weighted at 30%)
                    member.is_cabal_penalized = True
                    member.cabal_penalty_until = (
                        self.state.current_day + CABAL_PENALTY_DURATION_DAYS
                    )
                    
                    # Dynamic asset seizure (B2)
                    seizure_amount = member.balance * dynamic_seizure_rate
                    member.balance -= seizure_amount
                    member.total_penalty += seizure_amount
                    # Seized assets go to reward pool
                    self.state.reward_pool += seizure_amount