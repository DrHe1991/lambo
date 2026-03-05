#!/usr/bin/env python3
"""
API Integration Test - Simulates user behavior through API calls
and validates final state against simulator expectations.

Scale: 100 users × 30 days

Usage:
    cd api
    python tests/test_api_simulation.py

Requires:
    - API server running at http://localhost:8001
    - Database accessible via docker compose

Outputs:
    - api_simulation_report.txt: Human-readable report
    - api_simulation_data.json: Raw data for analysis
"""

import asyncio
import random
import time
import json
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional
from collections import defaultdict
import subprocess
import httpx

# API Configuration
API_BASE = 'http://localhost:8001/api'
TIMEOUT = 30.0

# Simulation Scale
NUM_USERS = 100
NUM_DAYS = 60

# User Type Distribution (from simulator/config.py)
USER_TYPE_DISTRIBUTION = {
    'elite_creator': 0.005,
    'active_creator': 0.03,
    'curator': 0.03,
    'normal': 0.245,
    'lurker': 0.55,
    'extreme_marketer': 0.02,
    'ad_spammer': 0.005,
    'low_quality_creator': 0.03,
    'toxic_creator': 0.01,
    'stupid_audience': 0.05,
    'malicious_challenger': 0.005,
    'cabal_member': 0.01,
}

# Behavior Profiles (from simulator/config.py)
@dataclass
class BehaviorProfile:
    daily_post_rate: float
    daily_like_rate: float
    daily_comment_rate: float
    content_quality: float
    like_quality: float
    challenge_rate: float
    violation_rate: float
    initial_balance: tuple


BEHAVIOR_PROFILES = {
    'elite_creator': BehaviorProfile(
        daily_post_rate=1.0, daily_like_rate=15, daily_comment_rate=8,
        content_quality=0.95, like_quality=0.90, challenge_rate=0.02,
        violation_rate=0.02, initial_balance=(150000, 750000)),
    'active_creator': BehaviorProfile(
        daily_post_rate=1.5, daily_like_rate=15, daily_comment_rate=8,
        content_quality=0.70, like_quality=0.70, challenge_rate=0.02,
        violation_rate=0.08, initial_balance=(45000, 150000)),
    'curator': BehaviorProfile(
        daily_post_rate=0.1, daily_like_rate=15, daily_comment_rate=6,
        content_quality=0.50, like_quality=0.85, challenge_rate=0.05,
        violation_rate=0.03, initial_balance=(30000, 120000)),
    'normal': BehaviorProfile(
        daily_post_rate=0.2, daily_like_rate=3, daily_comment_rate=1,
        content_quality=0.50, like_quality=0.60, challenge_rate=0.005,
        violation_rate=0.10, initial_balance=(7500, 45000)),
    'lurker': BehaviorProfile(
        daily_post_rate=0.02, daily_like_rate=0.5, daily_comment_rate=0.1,
        content_quality=0.40, like_quality=0.50, challenge_rate=0.001,
        violation_rate=0.15, initial_balance=(1500, 15000)),
    'extreme_marketer': BehaviorProfile(
        daily_post_rate=5.0, daily_like_rate=2, daily_comment_rate=3,
        content_quality=0.20, like_quality=0.30, challenge_rate=0.005,
        violation_rate=0.40, initial_balance=(30000, 120000)),
    'ad_spammer': BehaviorProfile(
        daily_post_rate=10.0, daily_like_rate=0, daily_comment_rate=5,
        content_quality=0.05, like_quality=0.10, challenge_rate=0.0,
        violation_rate=0.85, initial_balance=(15000, 75000)),
    'low_quality_creator': BehaviorProfile(
        daily_post_rate=1.5, daily_like_rate=5, daily_comment_rate=3,
        content_quality=0.25, like_quality=0.40, challenge_rate=0.01,
        violation_rate=0.25, initial_balance=(7500, 45000)),
    'toxic_creator': BehaviorProfile(
        daily_post_rate=3.0, daily_like_rate=3, daily_comment_rate=8,
        content_quality=0.15, like_quality=0.20, challenge_rate=0.05,
        violation_rate=0.50, initial_balance=(15000, 75000)),
    'stupid_audience': BehaviorProfile(
        daily_post_rate=0.05, daily_like_rate=4, daily_comment_rate=2,
        content_quality=0.30, like_quality=0.25, challenge_rate=0.002,
        violation_rate=0.20, initial_balance=(4500, 30000)),
    'malicious_challenger': BehaviorProfile(
        daily_post_rate=0.3, daily_like_rate=2, daily_comment_rate=1,
        content_quality=0.40, like_quality=0.40, challenge_rate=0.90,
        violation_rate=0.15, initial_balance=(30000, 120000)),
    'cabal_member': BehaviorProfile(
        daily_post_rate=3.0, daily_like_rate=35, daily_comment_rate=15,
        content_quality=0.35, like_quality=0.10, challenge_rate=0.02,
        violation_rate=0.35, initial_balance=(45000, 150000)),
}

# Expected outcomes from simulator
EXPECTED_GOOD_ACTORS = ['elite_creator', 'active_creator', 'curator']
EXPECTED_BAD_ACTORS = ['cabal_member', 'ad_spammer', 'extreme_marketer', 'toxic_creator']


@dataclass
class PostInfo:
    """Post with quality metadata for like targeting."""
    id: int
    author_id: int
    quality: float  # Derived from author's content_quality


@dataclass
class SimUser:
    """Simulated user with API ID and metadata."""
    id: int
    handle: str
    user_type: str
    profile: BehaviorProfile
    initial_balance: int = 0
    posts: List[int] = field(default_factory=list)


@dataclass
class DailyMetrics:
    """Metrics for one day of simulation."""
    day: int
    posts_created: int = 0
    likes_given: int = 0
    comments_made: int = 0
    challenges_initiated: int = 0
    errors: int = 0


class APISimulator:
    """Simulates user behavior through API calls."""

    def __init__(self):
        self.client: Optional[httpx.AsyncClient] = None
        self.users: List[SimUser] = []
        self.all_posts: List[PostInfo] = []  # Posts with quality metadata
        self.daily_metrics: List[DailyMetrics] = []
        self.cabal_members: List[SimUser] = []
        self.user_by_id: Dict[int, SimUser] = {}  # For quick lookup

    async def setup(self):
        """Initialize HTTP client and reset database."""
        self.client = httpx.AsyncClient(base_url=API_BASE, timeout=TIMEOUT)
        await self._reset_database()

    async def teardown(self):
        """Close HTTP client."""
        if self.client:
            await self.client.aclose()

    async def _reset_database(self):
        """Reset database to clean state via SQL."""
        print('Resetting database...')
        tables = [
            'ledger', 'post_likes', 'comment_likes', 'comments', 'posts',
            'jury_votes', 'challenges', 'cabal_members', 'cabal_groups',
            'post_rewards', 'comment_rewards', 'reward_pools',
            'interaction_logs', 'platform_revenue', 'follows', 'users'
        ]
        truncate_sql = '; '.join(f'TRUNCATE TABLE {t} CASCADE' for t in tables)
        
        cmd = [
            'docker', 'compose', 'exec', '-T', 'postgres',
            'psql', '-U', 'bitlink', '-d', 'bitlink', '-c', truncate_sql
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, cwd='/Users/the053/Documents/lambo')
        if result.returncode != 0:
            print(f'  Warning: DB reset returned {result.returncode}')
            print(f'  stderr: {result.stderr}')
        else:
            print('  Database reset complete')

    async def create_users(self):
        """Create users with type distribution from simulator."""
        print(f'\nCreating {NUM_USERS} users...')
        
        # Calculate user counts per type
        type_counts = {}
        remaining = NUM_USERS
        for utype, ratio in USER_TYPE_DISTRIBUTION.items():
            count = max(1, int(NUM_USERS * ratio)) if ratio >= 0.01 else 0
            if count > 0:
                type_counts[utype] = count
                remaining -= count
        
        # Distribute remaining to largest group
        if remaining > 0:
            type_counts['lurker'] = type_counts.get('lurker', 0) + remaining
        
        print(f'  Type distribution: {type_counts}')
        
        # Create users via API
        user_idx = 0
        for utype, count in type_counts.items():
            profile = BEHAVIOR_PROFILES.get(utype, BEHAVIOR_PROFILES['normal'])
            for i in range(count):
                handle = f'{utype[:4]}_{user_idx}'
                try:
                    resp = await self.client.post('/users', json={
                        'name': f'{utype.title()} {i}',
                        'handle': handle,
                    })
                    if resp.status_code == 201:
                        data = resp.json()
                        user = SimUser(
                            id=data['id'],
                            handle=handle,
                            user_type=utype,
                            profile=profile,
                        )
                        self.users.append(user)
                        self.user_by_id[user.id] = user
                        if utype == 'cabal_member':
                            self.cabal_members.append(user)
                        user_idx += 1
                except Exception as e:
                    print(f'  Error creating user {handle}: {e}')
        
        print(f'  Created {len(self.users)} users')

    async def fund_users(self):
        """Fund users with initial balance via SQL."""
        print('\nFunding users...')
        
        updates = []
        for user in self.users:
            bal = random.randint(*user.profile.initial_balance)
            user.initial_balance = bal
            updates.append(f"UPDATE users SET available_balance={bal}, free_posts_remaining=3 WHERE id={user.id}")
        
        sql = '; '.join(updates)
        cmd = [
            'docker', 'compose', 'exec', '-T', 'postgres',
            'psql', '-U', 'bitlink', '-d', 'bitlink', '-c', sql
        ]
        subprocess.run(cmd, capture_output=True, cwd='/Users/the053/Documents/lambo')
        print(f'  Funded {len(self.users)} users')

    async def create_follow_graph(self):
        """Create follow relationships between users."""
        print('\nCreating follow graph...')
        follows_created = 0
        
        # Cabal members follow each other
        for i, cabal_user in enumerate(self.cabal_members):
            for other in self.cabal_members:
                if cabal_user.id != other.id:
                    try:
                        resp = await self.client.post(
                            f'/users/{other.id}/follow',
                            params={'follower_id': cabal_user.id}
                        )
                        if resp.status_code == 201:
                            follows_created += 1
                    except:
                        pass
        
        # Other users follow randomly
        for user in self.users:
            if user.user_type == 'cabal_member':
                continue
            
            # Follow 3-5 random users
            num_follows = random.randint(3, 5)
            others = [u for u in self.users if u.id != user.id]
            to_follow = random.sample(others, min(num_follows, len(others)))
            
            for other in to_follow:
                try:
                    resp = await self.client.post(
                        f'/users/{other.id}/follow',
                        params={'follower_id': user.id}
                    )
                    if resp.status_code == 201:
                        follows_created += 1
                except:
                    pass
        
        print(f'  Created {follows_created} follow relationships')

    async def simulate_day(self, day: int):
        """Simulate one day of user activity."""
        metrics = DailyMetrics(day=day)
        
        # Shuffle users for random order
        random.shuffle(self.users)
        
        for user in self.users:
            profile = user.profile
            
            # Posts
            num_posts = self._random_count(profile.daily_post_rate)
            for _ in range(num_posts):
                await self._create_post(user, day, metrics)
            
            # Likes
            num_likes = self._random_count(profile.daily_like_rate)
            for _ in range(num_likes):
                await self._give_like(user, metrics)
            
            # Comments
            num_comments = self._random_count(profile.daily_comment_rate)
            for _ in range(num_comments):
                await self._create_comment(user, metrics)
            
            # Challenges
            if random.random() < profile.challenge_rate:
                await self._create_challenge(user, metrics)
        
        self.daily_metrics.append(metrics)

    def _random_count(self, rate: float) -> int:
        """Convert a rate to an integer count with randomness."""
        base = int(rate)
        if random.random() < (rate - base):
            base += 1
        return base

    async def _create_post(self, user: SimUser, day: int, metrics: DailyMetrics):
        """Create a post via API."""
        content = f'Day {day} post from {user.handle}: {random.randint(1000, 9999)}'
        
        try:
            resp = await self.client.post('/posts', params={'author_id': user.id}, json={
                'content': content,
            })
            if resp.status_code == 201:
                data = resp.json()
                post_id = data['id']
                user.posts.append(post_id)
                # Store post with quality metadata (like simulator)
                quality = min(1.0, max(0.0, user.profile.content_quality + random.gauss(0, 0.15)))
                self.all_posts.append(PostInfo(id=post_id, author_id=user.id, quality=quality))
                metrics.posts_created += 1
            elif resp.status_code == 402:
                pass  # Insufficient balance - expected
            else:
                metrics.errors += 1
        except Exception as e:
            metrics.errors += 1

    async def _give_like(self, user: SimUser, metrics: DailyMetrics):
        """Give a like based on user's like_quality (matches simulator behavior)."""
        if not self.all_posts:
            return
        
        # Filter to posts not by self
        candidates = [p for p in self.all_posts if p.author_id != user.id]
        if not candidates:
            return
        
        # Pick a post based on user behavior
        if user.user_type == 'cabal_member' and self.cabal_members and random.random() < 0.9:
            # Cabal members prefer cabal posts
            cabal_ids = {cm.id for cm in self.cabal_members}
            cabal_posts = [p for p in candidates if p.author_id in cabal_ids]
            if cabal_posts:
                post = random.choice(cabal_posts)
            else:
                post = random.choice(candidates)
        elif random.random() < user.profile.like_quality:
            # High like_quality: pick highest quality post (like simulator)
            post = max(candidates, key=lambda p: p.quality)
        else:
            # Low like_quality: pick randomly
            post = random.choice(candidates)
        
        try:
            resp = await self.client.post(
                f'/posts/{post.id}/like',
                params={'user_id': user.id}
            )
            if resp.status_code == 200:
                metrics.likes_given += 1
            elif resp.status_code in (400, 402):
                pass  # Already liked or insufficient balance
            else:
                metrics.errors += 1
        except Exception as e:
            metrics.errors += 1

    async def _create_comment(self, user: SimUser, metrics: DailyMetrics):
        """Create a comment on a random post."""
        if not self.all_posts:
            return
        
        post = random.choice(self.all_posts)
        
        try:
            resp = await self.client.post(
                f'/posts/{post.id}/comments',
                params={'author_id': user.id},
                json={'content': f'Comment from {user.handle}'}
            )
            if resp.status_code == 201:
                metrics.comments_made += 1
            elif resp.status_code in (400, 402, 404):
                pass  # Expected errors
            else:
                metrics.errors += 1
        except Exception as e:
            metrics.errors += 1

    async def _create_challenge(self, user: SimUser, metrics: DailyMetrics):
        """Create a challenge (report) on a random post, preferring low quality."""
        if not self.all_posts:
            return
        
        # Don't challenge own posts
        others_posts = [p for p in self.all_posts if p.author_id != user.id]
        if not others_posts:
            return
        
        # Like simulator: prefer low quality posts for challenges
        others_posts_sorted = sorted(others_posts, key=lambda p: p.quality)
        # Pick from bottom 20% more likely
        target_pool = others_posts_sorted[:max(1, len(others_posts_sorted) // 5)]
        post = random.choice(target_pool)
        
        try:
            resp = await self.client.post('/challenges', json={
                'challenger_id': user.id,
                'content_type': 'post',
                'content_id': post.id,
                'reason': 'Low quality or spam content',
                'violation_type': 'low_quality',
                'layer': 1,
            })
            if resp.status_code == 200:
                metrics.challenges_initiated += 1
            elif resp.status_code == 400:
                pass  # Expected (already challenged, own content, etc.)
        except Exception as e:
            metrics.errors += 1

    async def run_settlement(self, day: int):
        """Run settlement if it's settlement day."""
        try:
            # Run settlement for posts older than 3 days (faster for testing)
            resp = await self.client.post('/rewards/settle', params={'days_ago': 3})
            if resp.status_code == 200:
                data = resp.json()
                settled = data.get('posts_settled', 0)
                if settled > 0:
                    print(f'    Settlement: {settled} posts')
        except Exception as e:
            print(f'    Settlement error: {e}')

    async def advance_time(self):
        """Advance all timestamps by 1 day to simulate time passing."""
        sql = """
            UPDATE posts SET created_at = created_at - INTERVAL '1 day';
            UPDATE comments SET created_at = created_at - INTERVAL '1 day';
            UPDATE interaction_logs SET created_at = created_at - INTERVAL '1 day';
        """
        cmd = [
            'docker', 'compose', 'exec', '-T', 'postgres',
            'psql', '-U', 'bitlink', '-d', 'bitlink', '-c', sql
        ]
        subprocess.run(cmd, capture_output=True, cwd='/Users/the053/Documents/lambo')

    async def run_subsidy_distribution(self):
        """Run weekly quality subsidy distribution (like simulator)."""
        try:
            resp = await self.client.post('/rewards/subsidy')
            if resp.status_code == 200:
                data = resp.json()
                status = data.get('status', '')
                distributed = data.get('distributed', 0)
                pool = data.get('pool', 0)
                print(f'    Subsidy: status={status}, pool={pool}, distributed={distributed}')
        except Exception as e:
            print(f'    Subsidy error: {e}')

    async def run_cabal_detection(self):
        """Run cabal detection."""
        try:
            resp = await self.client.post('/rewards/cabal/detect')
            if resp.status_code == 200:
                data = resp.json()
                groups = data.get('groups_detected', 0)
                if groups > 0:
                    print(f'    Cabal detection: {groups} groups found')
                    # Apply penalties
                    for group in data.get('groups', []):
                        group_id = group.get('id')
                        if group_id:
                            await self.client.post(f'/rewards/cabal/{group_id}/penalize')
        except Exception as e:
            print(f'    Cabal detection error: {e}')

    async def fetch_final_state(self) -> Dict:
        """Fetch final state of all users."""
        print('\nFetching final state...')
        
        user_states = []
        for user in self.users:
            try:
                # Get balance
                bal_resp = await self.client.get(f'/users/{user.id}/balance')
                balance = bal_resp.json()['available_balance'] if bal_resp.status_code == 200 else 0
                
                # Get trust
                trust_resp = await self.client.get(f'/users/{user.id}/trust')
                trust_data = trust_resp.json() if trust_resp.status_code == 200 else {}
                
                user_states.append({
                    'id': user.id,
                    'type': user.user_type,
                    'initial_balance': user.initial_balance,
                    'final_balance': balance,
                    'net_income': balance - user.initial_balance,
                    'trust_score': trust_data.get('trust_score', 600),
                    'tier': trust_data.get('tier', 'blue'),
                    'creator_score': trust_data.get('creator_score', 500),
                    'curator_score': trust_data.get('curator_score', 500),
                    'risk_score': trust_data.get('risk_score', 0),
                })
            except Exception as e:
                print(f'  Error fetching state for user {user.id}: {e}')
        
        return {'users': user_states}

    def generate_report(self, final_state: Dict) -> Dict:
        """Generate comparison report."""
        print('\n' + '=' * 60)
        print('API INTEGRATION TEST REPORT')
        print('=' * 60)
        print(f'\nScale: {NUM_USERS} users × {NUM_DAYS} days')
        
        users = final_state['users']
        
        # Group by type
        by_type = defaultdict(list)
        for u in users:
            by_type[u['type']].append(u)
        
        # Trust distribution
        tier_counts = defaultdict(int)
        for u in users:
            tier_counts[u['tier']] += 1
        
        total = len(users)
        print('\n--- Trust Distribution ---')
        for tier in ['white', 'green', 'blue', 'purple', 'orange']:
            pct = (tier_counts[tier] / total * 100) if total > 0 else 0
            print(f'  {tier:8}: {tier_counts[tier]:3} ({pct:5.1f}%)')
        
        # Economic outcomes by type
        print('\n--- Economic Outcomes by Type ---')
        print(f'{"Type":<22} {"Count":>5} {"Avg Bal":>10} {"Avg Net":>10} {"Avg Trust":>10}')
        print('-' * 60)
        
        type_stats = {}
        checks_passed = 0
        checks_total = 0
        
        for utype, user_list in sorted(by_type.items()):
            if not user_list:
                continue
            
            avg_bal = sum(u['final_balance'] for u in user_list) / len(user_list)
            avg_net = sum(u['net_income'] for u in user_list) / len(user_list)
            avg_trust = sum(u['trust_score'] for u in user_list) / len(user_list)
            
            type_stats[utype] = {
                'count': len(user_list),
                'avg_balance': avg_bal,
                'avg_net': avg_net,
                'avg_trust': avg_trust,
            }
            
            # Check expectations
            status = ''
            if utype in EXPECTED_GOOD_ACTORS:
                checks_total += 1
                if avg_net > 0:
                    status = '✅'
                    checks_passed += 1
                else:
                    status = '❌ (expected +)'
            elif utype in EXPECTED_BAD_ACTORS:
                checks_total += 1
                if avg_net < 0:
                    status = '✅'
                    checks_passed += 1
                else:
                    status = '⚠️ (expected -)'
            
            print(f'{utype:<22} {len(user_list):>5} {avg_bal:>10.0f} {avg_net:>+10.0f} {avg_trust:>10.1f} {status}')
        
        # Cabal check
        print('\n--- Cabal Detection ---')
        cabal_users = by_type.get('cabal_member', [])
        if cabal_users:
            avg_risk = sum(u['risk_score'] for u in cabal_users) / len(cabal_users)
            normal_users = by_type.get('normal', [])
            normal_avg_risk = sum(u['risk_score'] for u in normal_users) / len(normal_users) if normal_users else 0
            
            print(f'  Cabal avg risk: {avg_risk:.1f}')
            print(f'  Normal avg risk: {normal_avg_risk:.1f}')
            
            checks_total += 1
            if avg_risk > normal_avg_risk:
                print('  Status: ✅ Cabal members have higher risk')
                checks_passed += 1
            else:
                print('  Status: ⚠️ Cabal risk not elevated')
        
        # Daily metrics summary
        print('\n--- Daily Activity Summary ---')
        total_posts = sum(m.posts_created for m in self.daily_metrics)
        total_likes = sum(m.likes_given for m in self.daily_metrics)
        total_comments = sum(m.comments_made for m in self.daily_metrics)
        total_challenges = sum(m.challenges_initiated for m in self.daily_metrics)
        total_errors = sum(m.errors for m in self.daily_metrics)
        
        print(f'  Total posts: {total_posts}')
        print(f'  Total likes: {total_likes}')
        print(f'  Total comments: {total_comments}')
        print(f'  Total challenges: {total_challenges}')
        print(f'  Total errors: {total_errors}')
        
        # Final verdict
        print('\n' + '=' * 60)
        print(f'RESULT: {checks_passed}/{checks_total} checks passed')
        if checks_passed == checks_total:
            print('✅ ALL CHECKS PASSED')
        else:
            print('⚠️ SOME CHECKS FAILED - may need parameter tuning')
        print('=' * 60)
        
        # Build full report
        report = {
            'timestamp': datetime.now().isoformat(),
            'config': {
                'num_users': NUM_USERS,
                'num_days': NUM_DAYS,
            },
            'checks_passed': checks_passed,
            'checks_total': checks_total,
            'type_stats': type_stats,
            'tier_counts': dict(tier_counts),
            'daily_metrics': [
                {
                    'day': i + 1,
                    'posts': m.posts_created,
                    'likes': m.likes_given,
                    'comments': m.comments_made,
                    'challenges': m.challenges_initiated,
                    'errors': m.errors,
                }
                for i, m in enumerate(self.daily_metrics)
            ],
            'activity_totals': {
                'posts': total_posts,
                'likes': total_likes,
                'comments': total_comments,
                'challenges': total_challenges,
                'errors': total_errors,
            },
            'users': final_state['users'],
        }
        
        return report

    def save_report(self, report: Dict) -> None:
        """Save report to files."""
        import os
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        report_dir = 'tests/simulation_reports'
        os.makedirs(report_dir, exist_ok=True)
        
        # Save JSON data
        json_path = f'{report_dir}/api_simulation_data_{timestamp}.json'
        with open(json_path, 'w') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f'\n📄 Data saved to: {json_path}')
        
        # Save human-readable report
        txt_path = f'{report_dir}/api_simulation_report_{timestamp}.txt'
        with open(txt_path, 'w') as f:
            f.write('=' * 60 + '\n')
            f.write('BitLink API Integration Test Report\n')
            f.write(f'Generated: {report["timestamp"]}\n')
            f.write('=' * 60 + '\n\n')
            
            f.write(f'Scale: {report["config"]["num_users"]} users × {report["config"]["num_days"]} days\n\n')
            
            f.write('--- Trust Distribution ---\n')
            for tier in ['white', 'green', 'blue', 'purple', 'orange']:
                count = report['tier_counts'].get(tier, 0)
                pct = count / report['config']['num_users'] * 100
                f.write(f'  {tier:8}: {count:3} ({pct:5.1f}%)\n')
            
            f.write('\n--- Economic Outcomes by Type ---\n')
            f.write(f'{"Type":<22} {"Count":>5} {"Avg Bal":>10} {"Avg Net":>10} {"Avg Trust":>10}\n')
            f.write('-' * 60 + '\n')
            
            for utype, stats in sorted(report['type_stats'].items()):
                f.write(f'{utype:<22} {stats["count"]:>5} {stats["avg_balance"]:>10.0f} '
                        f'{stats["avg_net"]:>+10.0f} {stats["avg_trust"]:>10.1f}\n')
            
            f.write('\n--- Activity Summary ---\n')
            totals = report['activity_totals']
            f.write(f'  Total posts: {totals["posts"]}\n')
            f.write(f'  Total likes: {totals["likes"]}\n')
            f.write(f'  Total comments: {totals["comments"]}\n')
            f.write(f'  Total challenges: {totals["challenges"]}\n')
            
            f.write('\n' + '=' * 60 + '\n')
            f.write(f'RESULT: {report["checks_passed"]}/{report["checks_total"]} checks passed\n')
            f.write('=' * 60 + '\n')
        
        print(f'📋 Report saved to: {txt_path}')


async def main():
    """Run the API integration test."""
    print('=' * 60)
    print('BitLink API Integration Test')
    print('=' * 60)
    
    start_time = time.time()
    sim = APISimulator()
    
    try:
        # Setup phase
        await sim.setup()
        await sim.create_users()
        await sim.fund_users()
        await sim.create_follow_graph()
        
        setup_time = time.time() - start_time
        print(f'\nSetup completed in {setup_time:.1f}s')
        
        # Simulation phase
        print(f'\nRunning simulation for {NUM_DAYS} days...')
        sim_start = time.time()
        
        for day in range(1, NUM_DAYS + 1):
            await sim.simulate_day(day)
            
            # Advance time to simulate day passing
            await sim.advance_time()
            
            # Progress
            metrics = sim.daily_metrics[-1]
            if day % 5 == 0 or day == 1:
                print(f'  Day {day:2}: posts={metrics.posts_created:3}, '
                      f'likes={metrics.likes_given:3}, comments={metrics.comments_made:3}, '
                      f'challenges={metrics.challenges_initiated}')
            
            # Run settlement periodically (start from day 4)
            if day >= 4 and day % 2 == 0:
                await sim.run_settlement(day)
            
            # Run cabal detection and subsidy distribution weekly (like simulator)
            if day % 7 == 0:
                await sim.run_cabal_detection()
                await sim.run_subsidy_distribution()
        
        # Final settlement
        await sim.run_settlement(NUM_DAYS)
        
        sim_time = time.time() - sim_start
        print(f'\nSimulation completed in {sim_time:.1f}s')
        
        # Verification phase
        final_state = await sim.fetch_final_state()
        report = sim.generate_report(final_state)
        
        # Save report files
        sim.save_report(report)
        
        total_time = time.time() - start_time
        print(f'\nTotal time: {total_time:.1f}s')
        
        return report
        
    finally:
        await sim.teardown()


if __name__ == '__main__':
    result = asyncio.run(main())
