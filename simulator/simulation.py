"""
BitLink Economic Simulator - Main Simulation Loop
"""

import random
import uuid
from typing import List, Dict, Optional
from collections import defaultdict
from dataclasses import dataclass

from config import (
    SIMULATION_SCALE, SIMULATION_DAYS, CABAL_GROUP_SIZE,
    USER_TYPE_DISTRIBUTION, UserType, TrustTier,
    C_POST, C_COMMENT, C_LIKE, F_L1,
    get_trust_tier, QUALITY_THRESHOLDS,
    # Anti-manipulation parameters
    CABAL_PENALTY_MULTIPLIER, CABAL_PENALTY_DURATION_DAYS,
    CABAL_DETECTION_RISK_THRESHOLD, VIOLATION_LIKE_PENALTY,
    # Daily free actions (new users only)
    DAILY_FREE_POSTS, DAILY_FREE_COMMENTS, DAILY_FREE_LIKES, FREE_TRIAL_DAYS,
    # Revenue split
    CREATOR_REVENUE_SHARE,
)
from models import (
    User, Content, ContentType, ContentStatus, Like, Challenge,
    ChallengeStatus, ChallengeVerdict, Cabal, SimulationState, DailyMetrics
)
from engine import EconomicEngine, ChallengeEngine


class BitLinkSimulator:
    """Main simulation controller"""
    
    def __init__(self, scale: int = SIMULATION_SCALE, days: int = SIMULATION_DAYS):
        self.scale = scale
        self.days = days
        self.state = SimulationState()
        self.economic_engine = EconomicEngine(self.state)
        self.challenge_engine = ChallengeEngine(self.state)
        
        # Track which users are in which cabal
        self.cabal_assignments: Dict[str, str] = {}
        
        # Audit tracking
        self.initial_balance = 0
        self.total_deposits = 0
    
    def initialize(self):
        """Initialize the simulation with users"""
        print(f"Initializing {self.scale} users...")
        
        # Create users by type
        for user_type, ratio in USER_TYPE_DISTRIBUTION.items():
            count = max(1, int(self.scale * ratio))  # At least 1 of each type
            for _ in range(count):
                user = User.create(user_type)
                self.state.add_user(user)
        
        print(f"Created {len(self.state.users)} users")
        
        # Create cabals for CABAL_MEMBER users
        cabal_members = [
            u for u in self.state.users.values() 
            if u.user_type == UserType.CABAL_MEMBER
        ]
        
        # Organize into groups
        if len(cabal_members) >= CABAL_GROUP_SIZE:
            random.shuffle(cabal_members)
            cabal_count = len(cabal_members) // CABAL_GROUP_SIZE
            
            for i in range(cabal_count):
                cabal = Cabal(id=f"cabal_{i}")
                start_idx = i * CABAL_GROUP_SIZE
                end_idx = start_idx + CABAL_GROUP_SIZE
                
                for member in cabal_members[start_idx:end_idx]:
                    cabal.add_member(member.id)
                    member.cabal_id = cabal.id
                    self.cabal_assignments[member.id] = cabal.id
                
                self.state.cabals[cabal.id] = cabal
            
            print(f"Created {len(self.state.cabals)} cabal groups")
        
        # Create initial social graph (simplified for speed)
        self._initialize_social_graph()
        
        # Record initial balance for audit
        self.initial_balance = sum(u.balance for u in self.state.users.values())
        
        # Print user type distribution
        type_counts = defaultdict(int)
        for user in self.state.users.values():
            type_counts[user.user_type] += 1
        
        print("\nUser distribution:")
        for ut, count in sorted(type_counts.items(), key=lambda x: -x[1]):
            print(f"  {ut.value}: {count} ({count/len(self.state.users)*100:.1f}%)")
    
    def _initialize_social_graph(self):
        """Create initial follow relationships (simplified for speed)"""
        users = list(self.state.users.values())
        user_count = len(users)
        
        for user in users:
            # Each user follows some others based on their type
            if user.user_type == UserType.CABAL_MEMBER:
                # Cabal members primarily follow each other
                cabal = self.state.cabals.get(user.cabal_id)
                if cabal:
                    for member_id in cabal.member_ids:
                        if member_id != user.id:
                            user.following.add(member_id)
                            self.state.users[member_id].followers.add(user.id)
                # Follow a few outsiders
                non_cabal = [u for u in users if u.cabal_id != user.cabal_id]
                if non_cabal:
                    outsiders = random.sample(non_cabal, min(3, len(non_cabal)))
                    for outsider in outsiders:
                        user.following.add(outsider.id)
                        outsider.followers.add(user.id)
            else:
                # Non-cabal users follow randomly (fewer for speed)
                follow_count = min(10, max(3, user_count // 10))
                others = [u for u in users if u.id != user.id]
                to_follow = random.sample(others, min(follow_count, len(others)))
                for other in to_follow:
                    user.following.add(other.id)
                    other.followers.add(user.id)
    
    def run(self, progress_interval: int = 5):
        """Run the simulation for configured number of days"""
        print(f"\nRunning simulation for {self.days} days...")
        
        for day in range(1, self.days + 1):
            self.state.current_day = day
            
            # Run daily simulation
            self._simulate_day(day)
            
            # Progress update
            if day % progress_interval == 0 or day == 1:
                self._print_progress(day)
        
        print("\nSimulation complete!")
        return self.state
    
    def _simulate_day(self, day: int):
        """Simulate one day of platform activity"""
        metrics = DailyMetrics(day=day)
        
        # Get active users (simplified: all users are potentially active)
        users = list(self.state.users.values())
        random.shuffle(users)
        
        active_users = []
        
        for user in users:
            user.account_age += 1
            
            # Probability of being active today (based on type)
            activity_prob = self._get_activity_probability(user)
            if random.random() < activity_prob:
                active_users.append(user)
                user.days_active += 1
        
        metrics.active_users = len(active_users)
        
        # NEW: Reset daily circle contributions
        self.economic_engine.reset_daily_contributions(day)
        
        # Monthly deposits
        if day % 30 == 0:
            self._process_monthly_deposits(users)
            # Decay interaction history
            for user in users:
                user.decay_interactions()
        
        # Simulate user actions
        for user in active_users:
            self._simulate_user_actions(user, day, metrics)
        
        # Settle rewards for content from 7 days ago (use today's DAU)
        self.economic_engine.settle_rewards(day, len(active_users))
        
        # Update spam index weekly and distribute quality subsidies
        if day % 7 == 0:
            self.economic_engine.update_spam_index()
            self.challenge_engine.detect_cabal_activity()
            
            # Distribute ALL platform revenue as quality subsidies
            from recommendation import distribute_quality_subsidy
            subsidy_result = distribute_quality_subsidy(
                self.state,
                self.state.platform_revenue,  # 100% of revenue
                day
            )
            # Deduct from platform revenue (should be all of it)
            self.state.platform_revenue -= subsidy_result['total_distributed']
        
        # Calculate trust distribution
        for user in users:
            tier = user.trust_tier
            if tier == TrustTier.WHITE:
                metrics.white_count += 1
            elif tier == TrustTier.GREEN:
                metrics.green_count += 1
            elif tier == TrustTier.BLUE:
                metrics.blue_count += 1
            elif tier == TrustTier.PURPLE:
                metrics.purple_count += 1
            elif tier == TrustTier.ORANGE:
                metrics.orange_count += 1
        
        self.state.daily_metrics.append(metrics)
    
    def _get_activity_probability(self, user: User) -> float:
        """Get probability of user being active today"""
        # Base activity from profile's daily_activity_hours
        profile = user.profile
        
        # Convert hours to probability (8 hours = 100% active)
        base_prob = min(1.0, profile.daily_activity_hours / 8.0)
        
        # High consistency means always active (bots)
        # Low consistency means random variance (humans)
        consistency = profile.activity_consistency
        
        if random.random() < consistency:
            # Consistent behavior - use base probability
            return base_prob
        else:
            # Random variance - human-like inconsistency
            return base_prob * random.uniform(0.3, 1.2)
    
    def _process_monthly_deposits(self, users: List[User]):
        """Process monthly deposits for users"""
        for user in users:
            if random.random() < user.profile.monthly_deposit_prob:
                amount = random.randint(*user.profile.monthly_deposit_amount)
                user.balance += amount
                self.total_deposits += amount
    
    def _simulate_user_actions(self, user: User, day: int, metrics: DailyMetrics):
        """Simulate a user's actions for the day"""
        profile = user.profile
        
        # Get individual multipliers (default to 1.0 if not set)
        mults = getattr(user, 'individual_multipliers', {})
        post_mult = mults.get('post_rate', 1.0)
        like_mult = mults.get('like_rate', 1.0)
        comment_mult = mults.get('comment_rate', 1.0)
        
        # === POST ===
        # High frequency users (bots/spammers) post multiple times per day
        effective_post_rate = profile.daily_post_rate * post_mult
        num_posts = int(effective_post_rate)
        if random.random() < (effective_post_rate - num_posts):
            num_posts += 1
        
        for _ in range(num_posts):
            self._create_post(user, day, metrics)
        
        # === LIKE ===
        effective_like_rate = profile.daily_like_rate * like_mult
        like_count = int(effective_like_rate * random.uniform(0.5, 1.5))
        for _ in range(like_count):
            self._give_like(user, day, metrics)
        
        # === COMMENT ===
        effective_comment_rate = profile.daily_comment_rate * comment_mult
        comment_count = int(effective_comment_rate * random.uniform(0.5, 1.5))
        for _ in range(comment_count):
            self._create_comment(user, day, metrics)
        
        # === CHALLENGE ===
        # Malicious challengers have very high challenge rate
        if random.random() < profile.challenge_rate:
            self._initiate_challenge(user, day, metrics)

    def _apply_cross_circle_preference(self, user: User, candidates: List[Content]) -> List[Content]:
        """Apply in-circle vs cross-circle preference to interaction targets."""
        if not candidates:
            return candidates

        circle_ids = set(user.following)
        if not circle_ids:
            return [c for c in candidates if c.author_id != user.id]

        in_circle = [c for c in candidates if c.author_id in circle_ids and c.author_id != user.id]
        out_circle = [c for c in candidates if c.author_id not in circle_ids and c.author_id != user.id]

        if random.random() < user.profile.cross_circle_rate:
            return out_circle or in_circle
        return in_circle or out_circle
    
    def _create_post(self, user: User, day: int, metrics: DailyMetrics):
        """Create a post for user"""
        user.reset_daily_free_actions(day)
        
        # Free actions only for new users (first 7 days)
        is_new_user = user.account_age <= FREE_TRIAL_DAYS
        
        if is_new_user and user.free_posts_used < DAILY_FREE_POSTS:
            cost = 0
            user.free_posts_used += 1
        else:
            cost = self.economic_engine.get_post_cost(user)
            if not user.can_afford(cost):
                return
            user.spend(cost)
            metrics.total_spent += cost
            # 50% to platform revenue (no reward pool)
            self.state.platform_revenue += cost
        
        # Determine content quality
        base_quality = user.profile.content_quality
        quality = min(1.0, max(0.0, base_quality + random.gauss(0, 0.15)))
        
        # Determine if violation
        is_violation = random.random() < user.profile.violation_rate
        violation_type = None
        if is_violation:
            if user.user_type == UserType.AD_SPAMMER:
                violation_type = 'spam_ad'
            elif user.user_type == UserType.TOXIC_CREATOR:
                violation_type = 'low_quality'  # Could be worse
            else:
                violation_type = random.choice(['low_quality', 'spam_ad'])
        
        # Human pledge decision
        use_pledge = random.random() < user.profile.human_pledge_rate
        
        # Check if actually AI/plagiarism (for pledge risk)
        is_ai = user.user_type in [UserType.AD_SPAMMER, UserType.EXTREME_MARKETER]
        is_ai = is_ai and random.random() < 0.3
        
        content = Content(
            id=str(uuid.uuid4())[:8],
            author_id=user.id,
            content_type=ContentType.POST,
            created_day=day,
            quality=quality,
            human_pledge=use_pledge,
            is_ai_generated=is_ai,
            is_violation=is_violation,
            violation_type=violation_type,
            cost_paid=cost,
        )
        
        self.state.add_content(content)
        user.posts_created += 1
        user.reputation.record_post()  # 行为证明
        metrics.posts_created += 1
        
        # 实时声誉增长：发帖即得 Creator 分数（非违规内容）
        if not is_violation:
            from config import REPUTATION_EVENTS, TIER_REWARD_MULTIPLIER
            event = REPUTATION_EVENTS.get('post_created')
            if event:
                tier_mult = TIER_REWARD_MULTIPLIER.get(user.trust_tier, 1.0)
                change = random.uniform(event.min_change, event.max_change)
                user.reputation.apply_change(event.dimension, change, tier_mult)
    
    def _sample_content_by_exposure(self, content_list: List[Content], k: int, day: int) -> List[Content]:
        """Sample content weighted by exposure using new recommendation system"""
        from recommendation import sample_content_for_feed
        return sample_content_for_feed(content_list, self.state, day, k)
    
    def _give_like(self, user: User, day: int, metrics: DailyMetrics):
        """User gives a like to content"""
        user.reset_daily_free_actions(day)
        
        # Free actions only for new users (first 7 days)
        is_new_user = user.account_age <= FREE_TRIAL_DAYS
        
        if is_new_user and user.free_likes_used < DAILY_FREE_LIKES:
            cost = 0
            is_free = True
        else:
            cost = self.economic_engine.get_like_cost(user)
            if not user.can_afford(cost):
                return
            is_free = False
        
        # Find content to like (use cached recent content)
        recent_content = self.state.get_content_by_day_range(day - 7, day)
        if not recent_content:
            return
        
        sample_size = min(15, len(recent_content))
        if sample_size == 0:
            return
        
        # Choose content based on user's like_quality
        if user.user_type == UserType.CABAL_MEMBER:
            cabal = self.state.cabals.get(user.cabal_id)
            if cabal and random.random() < 0.9:
                cabal_ids = cabal.member_ids
                cabal_content = [c for c in recent_content if c.author_id in cabal_ids and c.author_id != user.id]
                if cabal_content:
                    recent_content = cabal_content
                    sample_size = min(10, len(recent_content))
        
        # Sample candidates weighted by exposure (inferred quality × time decay)
        candidates = self._sample_content_by_exposure(recent_content, sample_size, day)

        candidates = self._apply_cross_circle_preference(user, candidates)
        if not candidates:
            return
        
        # Pick based on like_quality
        if random.random() < user.profile.like_quality:
            content = max(candidates, key=lambda c: c.quality)
        else:
            # Simplified: just pick randomly from already-weighted sample
            content = random.choice(candidates)
        
        # Don't like own content
        if content.author_id == user.id:
            return
        
        # Simplified duplicate check
        if content.likes and user.id in {l.user_id for l in content.likes[-10:]}:
            return
        
        # Get author first (needed for payment)
        author = self.state.users.get(content.author_id)
        if not author:
            return
        
        # Spend (or use free action)
        if is_free:
            user.free_likes_used += 1
        else:
            user.spend(cost)
            metrics.total_spent += cost
            # NEW: 50% to creator, 50% to platform
            creator_share = cost * CREATOR_REVENUE_SHARE
            platform_share = cost - creator_share
            author.earn(creator_share)
            self.state.platform_revenue += platform_share
        
        # Calculate like weight
        like_order = len(content.likes) + 1
        w, n, s, ce, scout, penalty_mult = self.economic_engine.calculate_like_weight(
            user, author, content, like_order, current_day=day
        )
        
        # Additional cabal penalty if user is penalized
        if user.is_cabal_penalized and day < user.cabal_penalty_until:
            penalty_mult *= CABAL_PENALTY_MULTIPLIER
        
        # Cross-circle bonus: liker not following author = 1.5x weight
        is_cross_circle = author.id not in user.following
        cross_circle_mult = 1.5 if is_cross_circle else 1.0
        
        like = Like(
            id=f"{user.id[:4]}{day}{like_order}",  # Faster ID generation
            user_id=user.id,
            content_id=content.id,
            created_day=day,
            w_trust=w,
            n_novelty=n,
            s_source=s,
            ce_entropy=ce,
            scout_mult=scout,
            liker_trust_score=user.trust_score,
            cabal_penalty_mult=penalty_mult,
            cross_circle_mult=cross_circle_mult,
        )
        
        content.likes.append(like)
        user.likes_given += 1
        user.reputation.record_like()  # 行为证明
        user.record_interaction(author.id)
        metrics.likes_given += 1
        
        # 实时声誉增长：点赞即得 Curator 分数
        from config import REPUTATION_EVENTS, TIER_REWARD_MULTIPLIER
        event = REPUTATION_EVENTS.get('like_given')
        if event:
            tier_mult = TIER_REWARD_MULTIPLIER.get(user.trust_tier, 1.0)
            change = random.uniform(event.min_change, event.max_change)
            user.reputation.apply_change(event.dimension, change, tier_mult)
    
    def _create_comment(self, user: User, day: int, metrics: DailyMetrics):
        """User creates a comment"""
        user.reset_daily_free_actions(day)
        
        # Free actions only for new users (first 7 days)
        is_new_user = user.account_age <= FREE_TRIAL_DAYS
        
        if is_new_user and user.free_comments_used < DAILY_FREE_COMMENTS:
            cost = 0
            is_free = True
        else:
            cost = self.economic_engine.get_comment_cost(user)
            if not user.can_afford(cost):
                return
            is_free = False
        
        # Find content to comment on (reuse cached content)
        recent_content = self.state.get_content_by_day_range(day - 7, day)
        if not recent_content:
            return
        
        # Sample weighted by exposure (inferred quality × time decay)
        sample_size = min(8, len(recent_content))
        candidates = self._sample_content_by_exposure(recent_content, sample_size, day)
        
        candidates = self._apply_cross_circle_preference(user, candidates)
        if not candidates:
            return
        
        # Simplified: pick randomly from already-weighted sample
        content = random.choice(candidates)
        
        # Spend (or use free action)
        if is_free:
            user.free_comments_used += 1
            actual_cost = 0
        else:
            user.spend(cost)
            metrics.total_spent += cost
            # 50% to platform (comment fees don't go to content author)
            self.state.platform_revenue += cost
            actual_cost = cost
        
        # Create comment
        comment = Content(
            id=f"c{user.id[:3]}{day}{metrics.comments_made}",
            author_id=user.id,
            content_type=ContentType.COMMENT,
            created_day=day,
            quality=user.profile.content_quality + random.gauss(0, 0.1),
            parent_id=content.id,
            cost_paid=actual_cost,
        )
        
        self.state.add_content(comment)
        content.comments.append(comment.id)
        user.comments_made += 1
        metrics.comments_made += 1
        
        # 实时声誉增长：评论即得 Curator 分数
        from config import REPUTATION_EVENTS, TIER_REWARD_MULTIPLIER
        event = REPUTATION_EVENTS.get('comment_created')
        if event:
            tier_mult = TIER_REWARD_MULTIPLIER.get(user.trust_tier, 1.0)
            change = random.uniform(event.min_change, event.max_change)
            user.reputation.apply_change(event.dimension, change, tier_mult)
    
    def _initiate_challenge(self, user: User, day: int, metrics: DailyMetrics):
        """User initiates a challenge"""
        cost = self.economic_engine.get_challenge_cost(user, layer=1)
        
        if not user.can_afford(cost):
            return
        
        # Find content to challenge
        recent_content = self.state.get_content_by_day_range(day - 7, day)
        recent_content = [
            c for c in recent_content 
            if c.status == ContentStatus.ACTIVE and c.author_id != user.id
        ]
        
        if not recent_content:
            return

        recent_content = self._apply_cross_circle_preference(user, recent_content)
        if not recent_content:
            return
        
        # Choose what to challenge based on accuracy
        if user.user_type == UserType.MALICIOUS_CHALLENGER:
            # Malicious challengers target good content
            recent_content.sort(key=lambda c: c.quality, reverse=True)
            target = random.choice(recent_content[:max(1, len(recent_content) // 5)])
        else:
            # Normal users try to find violations
            # Sort by quality (low quality more likely to be violation)
            recent_content.sort(key=lambda c: c.quality)
            
            # Better accuracy = more likely to pick actual violations
            if random.random() < user.profile.challenge_accuracy:
                # Try to pick actual violations
                violations = [c for c in recent_content if c.is_violation]
                if violations:
                    target = random.choice(violations)
                else:
                    target = random.choice(recent_content[:max(1, len(recent_content) // 3)])
            else:
                # Random pick from low quality
                target = random.choice(recent_content[:max(1, len(recent_content) // 2)])
        
        # Spend
        user.spend(cost)
        metrics.total_spent += cost
        
        # Create challenge
        challenge = Challenge(
            id=str(uuid.uuid4())[:8],
            content_id=target.id,
            challenger_id=user.id,
            author_id=target.author_id,
            created_day=day,
            l1_fee=cost,
        )
        
        self.state.add_challenge(challenge)
        target.status = ContentStatus.CHALLENGED
        user.challenges_initiated += 1
        user.reputation.record_challenge()  # 行为证明
        metrics.challenges_initiated += 1
        
        # Resolve immediately (simplified)
        is_violation = self.challenge_engine.resolve_challenge(challenge)
        
        if is_violation:
            metrics.violations_caught += 1
        else:
            metrics.false_challenges += 1
    
    def _print_progress(self, day: int):
        """Print progress update"""
        metrics = self.state.daily_metrics[-1] if self.state.daily_metrics else None
        
        if not metrics:
            return
        
        # Calculate aggregate stats
        total_balance = sum(u.balance for u in self.state.users.values())
        avg_balance = total_balance / len(self.state.users)
        
        # Trust distribution
        print(f"\n=== Day {day}/{self.days} ===")
        print(f"Active users: {metrics.active_users}")
        print(f"Posts: {metrics.posts_created}, Likes: {metrics.likes_given}, Comments: {metrics.comments_made}")
        print(f"Challenges: {metrics.challenges_initiated} (violations: {metrics.violations_caught})")
        print(f"Avg balance: {avg_balance:.0f} sat")
        print(f"Trust: W={metrics.white_count} G={metrics.green_count} B={metrics.blue_count} P={metrics.purple_count} O={metrics.orange_count}")
        print(f"Spam Index: {self.state.spam_index:.2f}")


def main():
    """Run the simulation"""
    import sys
    import time
    
    print("Starting BitLink Economic Simulator...", flush=True)
    sys.stdout.flush()
    
    start_time = time.time()
    
    sim = BitLinkSimulator(scale=1000, days=120)
    print("Simulator created, initializing...", flush=True)
    sim.initialize()
    
    init_time = time.time()
    print(f"Initialization took {init_time - start_time:.1f}s", flush=True)
    print("Running simulation...", flush=True)
    
    state = sim.run(progress_interval=20)
    
    sim_time = time.time()
    print(f"Simulation took {sim_time - init_time:.1f}s", flush=True)
    
    # Generate report with audit data
    print("\nGenerating report...", flush=True)
    from report_generator import generate_report
    report_path = generate_report(
        state,
        metadata={
            'scale': 1000,
            'days': 120,
        },
        audit_data={
            'initial_balance': sim.initial_balance,
            'total_deposits': sim.total_deposits,
        }
    )
    
    total_time = time.time()
    print(f"\nTotal time: {total_time - start_time:.1f}s", flush=True)


class OrganicGrowthSimulator(BitLinkSimulator):
    """Simulator with organic user growth from cold start"""
    
    def __init__(self, initial_users: int = 10, final_users: int = 1000, 
                 days: int = 360):
        super().__init__(scale=final_users, days=days)
        self.initial_users = initial_users
        self.final_users = final_users
        
        # Calculate growth rate: N(t) = N0 * e^(rt), solve for r
        # final_users = initial_users * e^(r * days)
        # r = ln(final_users / initial_users) / days
        import math
        self.growth_rate = math.log(final_users / initial_users) / days
        
    def initialize(self):
        """Initialize with only seed users (all good actors)"""
        print(f"Cold start with {self.initial_users} seed users...")
        
        # Create seed users - all elite or active creators
        seed_types = [
            UserType.ELITE_CREATOR,
            UserType.ELITE_CREATOR,
            UserType.ACTIVE_CREATOR,
            UserType.ACTIVE_CREATOR,
            UserType.ACTIVE_CREATOR,
            UserType.CURATOR,
            UserType.CURATOR,
            UserType.NORMAL,
            UserType.NORMAL,
            UserType.NORMAL,
        ]
        
        for i in range(self.initial_users):
            user_type = seed_types[i % len(seed_types)]
            user = User.create(user_type)
            self.state.add_user(user)
        
        print(f"Created {len(self.state.users)} seed users")
        
        # Initialize social graph for seed users
        self._initialize_social_graph()
        
        # Record initial balance
        self.initial_balance = sum(u.balance for u in self.state.users.values())
        
        # Print distribution
        type_counts = defaultdict(int)
        for user in self.state.users.values():
            type_counts[user.user_type] += 1
        print("\nSeed user distribution:")
        for ut, count in sorted(type_counts.items(), key=lambda x: -x[1]):
            print(f"  {ut.value}: {count}")
    
    def _calculate_expected_users(self, day: int) -> int:
        """Calculate expected user count at given day using exponential growth"""
        import math
        return int(self.initial_users * math.exp(self.growth_rate * day))
    
    def _add_new_users(self, day: int) -> int:
        """Add new users based on growth curve, return count added"""
        current_users = len(self.state.users)
        expected_users = self._calculate_expected_users(day)
        new_user_count = max(0, expected_users - current_users)
        
        if new_user_count == 0:
            return 0
        
        # Add new users with random roles (following distribution)
        existing_users = list(self.state.users.values())
        
        for _ in range(new_user_count):
            # Pick random user type based on distribution
            roll = random.random()
            cumulative = 0
            user_type = UserType.NORMAL  # default
            for ut, prob in USER_TYPE_DISTRIBUTION.items():
                cumulative += prob
                if roll < cumulative:
                    user_type = ut
                    break
            
            user = User.create(user_type)
            self.state.add_user(user)
            
            # New user follows some existing users
            if existing_users:
                follow_count = min(5, len(existing_users))
                to_follow = random.sample(existing_users, follow_count)
                for other in to_follow:
                    user.following.add(other.id)
                    other.followers.add(user.id)
            
            # Handle cabal membership
            if user_type == UserType.CABAL_MEMBER:
                # Find or create a cabal
                existing_cabals = list(self.state.cabals.values())
                if existing_cabals:
                    cabal = random.choice(existing_cabals)
                else:
                    cabal = Cabal(id=f"cabal_{len(self.state.cabals)}")
                    self.state.cabals[cabal.id] = cabal
                
                cabal.add_member(user.id)
                user.cabal_id = cabal.id
                self.cabal_assignments[user.id] = cabal.id
                
                # Follow other cabal members
                for member_id in cabal.member_ids:
                    if member_id != user.id and member_id in self.state.users:
                        user.following.add(member_id)
                        self.state.users[member_id].followers.add(user.id)
        
        return new_user_count
    
    def _simulate_day(self, day: int):
        """Simulate one day with user growth"""
        # Add new users based on growth curve
        new_users = self._add_new_users(day)
        
        # Then run normal day simulation
        super()._simulate_day(day)
        
        # Track new users in metrics
        if day in [d.day for d in self.state.daily_metrics]:
            for m in self.state.daily_metrics:
                if m.day == day:
                    m.total_users = len(self.state.users)
                    break


if __name__ == '__main__':
    main()
