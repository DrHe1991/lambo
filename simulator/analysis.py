"""
BitLink Economic Simulator - Analysis and Visualization
"""

import json
from typing import Dict, List, Tuple
from collections import defaultdict
from dataclasses import asdict
import statistics

from config import UserType, TrustTier, get_trust_tier
from models import SimulationState, User, DailyMetrics


class SimulationAnalyzer:
    """Analyze simulation results and generate reports"""
    
    def __init__(self, state: SimulationState):
        self.state = state
    
    def generate_report(self, output_file: str = 'simulation_report.txt'):
        """Generate comprehensive analysis report"""
        lines = []
        lines.append("=" * 80)
        lines.append("BITLINK ECONOMIC SIMULATION REPORT")
        lines.append("=" * 80)
        lines.append("")
        
        # Overview
        lines.extend(self._generate_overview())
        
        # User type analysis
        lines.extend(self._generate_user_type_analysis())
        
        # Trust tier evolution
        lines.extend(self._generate_trust_analysis())
        
        # Economic analysis
        lines.extend(self._generate_economic_analysis())
        
        # Cabal detection analysis
        lines.extend(self._generate_cabal_analysis())
        
        # Content quality analysis
        lines.extend(self._generate_content_analysis())
        
        # Winners and losers
        lines.extend(self._generate_winners_losers())
        
        # Conclusions
        lines.extend(self._generate_conclusions())
        
        report = "\n".join(lines)
        
        # Print to console
        print(report)
        
        # Save to file
        with open(output_file, 'w') as f:
            f.write(report)
        
        print(f"\nReport saved to {output_file}")
        
        # Export per-user CSV
        self._export_user_csv('simulation_users.csv')
        
        # Also save raw data as JSON
        self._save_raw_data('simulation_data.json')
    
    def _generate_overview(self) -> List[str]:
        lines = []
        lines.append("\n" + "=" * 40)
        lines.append("1. SIMULATION OVERVIEW")
        lines.append("=" * 40)
        
        lines.append(f"Duration: {self.state.current_day} days")
        lines.append(f"Total users: {len(self.state.users)}")
        lines.append(f"Total content created: {len(self.state.content)}")
        lines.append(f"Total challenges: {len(self.state.challenges)}")
        lines.append(f"Final spam index: {self.state.spam_index:.3f}")
        
        # Final day metrics
        if self.state.daily_metrics:
            final = self.state.daily_metrics[-1]
            lines.append(f"Final day active users: {final.active_users}")
        
        return lines
    
    def _generate_user_type_analysis(self) -> List[str]:
        lines = []
        lines.append("\n" + "=" * 40)
        lines.append("2. USER TYPE ANALYSIS")
        lines.append("=" * 40)
        
        # Group users by type
        by_type: Dict[UserType, List[User]] = defaultdict(list)
        for user in self.state.users.values():
            by_type[user.user_type].append(user)
        
        lines.append("\n{:<25} {:>6} {:>10} {:>10} {:>10} {:>8} {:>8}".format(
            "User Type", "Count", "Avg Bal", "Avg Earn", "Avg Spend", "Net", "Trust"
        ))
        lines.append("-" * 87)
        
        type_results = []
        
        for user_type in UserType:
            users = by_type.get(user_type, [])
            if not users:
                continue
            
            avg_balance = statistics.mean(u.balance for u in users)
            avg_earned = statistics.mean(u.total_earned for u in users)
            avg_spent = statistics.mean(u.total_spent for u in users)
            avg_net = avg_earned - avg_spent
            avg_trust = statistics.mean(u.trust_score for u in users)
            
            type_results.append({
                'type': user_type,
                'count': len(users),
                'avg_balance': avg_balance,
                'avg_earned': avg_earned,
                'avg_spent': avg_spent,
                'avg_net': avg_net,
                'avg_trust': avg_trust,
            })
            
            lines.append("{:<25} {:>6} {:>10.0f} {:>10.0f} {:>10.0f} {:>+8.0f} {:>8.1f}".format(
                user_type.value, len(users), avg_balance, avg_earned, avg_spent, avg_net, avg_trust
            ))
        
        # Sort by net income
        lines.append("\n--- Sorted by Net Income ---")
        type_results.sort(key=lambda x: x['avg_net'], reverse=True)
        
        for i, r in enumerate(type_results, 1):
            emoji = "🏆" if i <= 3 else ("💀" if r['avg_net'] < 0 else "  ")
            lines.append(f"{emoji} {i}. {r['type'].value}: {r['avg_net']:+.0f} sat/user")
        
        return lines
    
    def _generate_trust_analysis(self) -> List[str]:
        lines = []
        lines.append("\n" + "=" * 40)
        lines.append("3. TRUST TIER DISTRIBUTION")
        lines.append("=" * 40)
        
        # Evolution over time
        if len(self.state.daily_metrics) > 1:
            lines.append("\n--- Trust Distribution Evolution ---")
            checkpoints = [0, len(self.state.daily_metrics) // 4, 
                          len(self.state.daily_metrics) // 2,
                          3 * len(self.state.daily_metrics) // 4,
                          len(self.state.daily_metrics) - 1]
            
            lines.append("\n{:>6} {:>8} {:>8} {:>8} {:>8} {:>8}".format(
                "Day", "White", "Green", "Blue", "Purple", "Orange"
            ))
            lines.append("-" * 54)
            
            for idx in checkpoints:
                if idx < len(self.state.daily_metrics):
                    m = self.state.daily_metrics[idx]
                    total = m.white_count + m.green_count + m.blue_count + m.purple_count + m.orange_count
                    if total > 0:
                        lines.append("{:>6} {:>7.1%} {:>7.1%} {:>7.1%} {:>7.1%} {:>7.1%}".format(
                            m.day,
                            m.white_count / total,
                            m.green_count / total,
                            m.blue_count / total,
                            m.purple_count / total,
                            m.orange_count / total,
                        ))
        
        # Final trust by user type
        lines.append("\n--- Final Trust by User Type ---")
        by_type: Dict[UserType, List[User]] = defaultdict(list)
        for user in self.state.users.values():
            by_type[user.user_type].append(user)
        
        for user_type in UserType:
            users = by_type.get(user_type, [])
            if not users:
                continue
            
            tier_counts = defaultdict(int)
            for u in users:
                tier_counts[u.trust_tier] += 1
            
            dist = ", ".join(f"{t.value}:{c}" for t, c in sorted(tier_counts.items(), key=lambda x: x[1], reverse=True))
            lines.append(f"  {user_type.value}: {dist}")
        
        return lines
    
    def _generate_economic_analysis(self) -> List[str]:
        lines = []
        lines.append("\n" + "=" * 40)
        lines.append("4. ECONOMIC ANALYSIS")
        lines.append("=" * 40)
        
        # Total economics
        total_balance = sum(u.balance for u in self.state.users.values())
        total_earned = sum(u.total_earned for u in self.state.users.values())
        total_spent = sum(u.total_spent for u in self.state.users.values())
        total_penalty = sum(u.total_penalty for u in self.state.users.values())
        
        lines.append(f"\nTotal balance in system: {total_balance:,.0f} sat")
        lines.append(f"Total earned: {total_earned:,.0f} sat")
        lines.append(f"Total spent: {total_spent:,.0f} sat")
        lines.append(f"Total penalties: {total_penalty:,.0f} sat")
        lines.append(f"Platform emission (est): {(total_earned - total_spent + total_penalty):,.0f} sat")
        
        # Gini coefficient
        balances = sorted([u.balance for u in self.state.users.values()])
        gini = self._calculate_gini(balances)
        lines.append(f"\nGini coefficient (wealth inequality): {gini:.3f}")
        
        # Wealth distribution
        lines.append("\n--- Wealth Distribution ---")
        percentiles = [10, 25, 50, 75, 90, 95, 99]
        for p in percentiles:
            idx = int(len(balances) * p / 100)
            lines.append(f"  {p}th percentile: {balances[idx]:,.0f} sat")
        
        # Income distribution by type
        lines.append("\n--- Monthly Income Potential by Type ---")
        by_type: Dict[UserType, List[User]] = defaultdict(list)
        for user in self.state.users.values():
            by_type[user.user_type].append(user)
        
        for user_type in sorted(by_type.keys(), key=lambda x: x.value):
            users = by_type[user_type]
            if not users:
                continue
            monthly_income = statistics.mean(u.total_earned / max(1, self.state.current_day / 30) for u in users)
            monthly_expense = statistics.mean(u.total_spent / max(1, self.state.current_day / 30) for u in users)
            lines.append(f"  {user_type.value}: {monthly_income:+.0f} earn / {monthly_expense:.0f} spend = {monthly_income - monthly_expense:+.0f} net")
        
        return lines
    
    def _generate_cabal_analysis(self) -> List[str]:
        lines = []
        lines.append("\n" + "=" * 40)
        lines.append("5. CABAL / MANIPULATION ANALYSIS")
        lines.append("=" * 40)
        
        total_cabals = len(self.state.cabals)
        detected = sum(1 for c in self.state.cabals.values() if c.detected)
        
        lines.append(f"\nTotal cabal groups: {total_cabals}")
        lines.append(f"Detected: {detected} ({detected/max(1,total_cabals)*100:.1f}%)")
        
        # Cabal member outcomes
        cabal_users = [u for u in self.state.users.values() if u.user_type == UserType.CABAL_MEMBER]
        if cabal_users:
            avg_balance = statistics.mean(u.balance for u in cabal_users)
            avg_trust = statistics.mean(u.trust_score for u in cabal_users)
            avg_risk = statistics.mean(u.reputation.risk for u in cabal_users)
            
            lines.append(f"\nCabal member outcomes:")
            lines.append(f"  Average balance: {avg_balance:.0f} sat")
            lines.append(f"  Average trust: {avg_trust:.1f}")
            lines.append(f"  Average risk score: {avg_risk:.1f}")
            
            # Compare to normal users
            normal_users = [u for u in self.state.users.values() if u.user_type == UserType.NORMAL]
            if normal_users:
                normal_avg = statistics.mean(u.balance for u in normal_users)
                lines.append(f"  vs Normal user avg: {normal_avg:.0f} sat")
                lines.append(f"  Cabal advantage: {(avg_balance/max(1,normal_avg)-1)*100:+.1f}%")
            
            # NEW: Show suspicion analysis for debugging
            lines.append(f"\n--- Cabal Member Suspicion Debug ---")
            from engine import EconomicEngine
            engine = EconomicEngine(self.state)
            
            for member in cabal_users[:5]:  # Show first 5
                suspicion = engine.calculate_user_suspicion(member)
                total_interactions = sum(member.interaction_history.values())
                
                # Calculate concentration
                if total_interactions > 0:
                    sorted_interactions = sorted(
                        member.interaction_history.items(),
                        key=lambda x: x[1],
                        reverse=True
                    )
                    top_10_sum = sum(c for _, c in sorted_interactions[:10])
                    concentration = top_10_sum / total_interactions
                else:
                    concentration = 0
                
                lines.append(f"  {member.id[:8]}: suspicion={suspicion:.2f}, "
                           f"conc={concentration:.2f}, "
                           f"interactions={total_interactions}")
        
        return lines
    
    def _generate_content_analysis(self) -> List[str]:
        lines = []
        lines.append("\n" + "=" * 40)
        lines.append("6. CONTENT QUALITY ANALYSIS")
        lines.append("=" * 40)
        
        content_list = list(self.state.content.values())
        
        if not content_list:
            lines.append("No content created")
            return lines
        
        # Quality distribution
        quality_values = [c.quality for c in content_list]
        lines.append(f"\nTotal content: {len(content_list)}")
        lines.append(f"Average quality: {statistics.mean(quality_values):.3f}")
        lines.append(f"Quality std dev: {statistics.stdev(quality_values) if len(quality_values) > 1 else 0:.3f}")
        
        # Violations
        violations = [c for c in content_list if c.is_violation]
        lines.append(f"\nViolation content: {len(violations)} ({len(violations)/len(content_list)*100:.1f}%)")
        
        # Discovery score analysis
        scored_content = [c for c in content_list if c.discovery_score > 0]
        if scored_content:
            scores = [c.discovery_score for c in scored_content]
            lines.append(f"\nContent with engagement: {len(scored_content)}")
            lines.append(f"Average discovery score: {statistics.mean(scores):.2f}")
            
            # Top content
            top_content = sorted(scored_content, key=lambda c: c.discovery_score, reverse=True)[:10]
            lines.append("\n--- Top 10 Content by Discovery Score ---")
            for i, c in enumerate(top_content, 1):
                author = self.state.users.get(c.author_id)
                author_type = author.user_type.value if author else "unknown"
                lines.append(f"  {i}. Score: {c.discovery_score:.2f}, Quality: {c.quality:.2f}, "
                           f"Likes: {c.like_count}, Author: {author_type}")
        
        return lines
    
    def _generate_winners_losers(self) -> List[str]:
        lines = []
        lines.append("\n" + "=" * 40)
        lines.append("7. WINNERS & LOSERS")
        lines.append("=" * 40)
        
        users = list(self.state.users.values())
        
        # Sort by net income
        users_by_income = sorted(users, key=lambda u: u.total_earned - u.total_spent, reverse=True)
        
        lines.append("\n--- TOP 10 EARNERS ---")
        for i, u in enumerate(users_by_income[:10], 1):
            net = u.total_earned - u.total_spent
            lines.append(f"  {i}. {u.user_type.value}: {net:+,.0f} sat (Trust: {u.trust_score:.0f})")
        
        lines.append("\n--- TOP 10 LOSERS ---")
        for i, u in enumerate(users_by_income[-10:], 1):
            net = u.total_earned - u.total_spent
            lines.append(f"  {i}. {u.user_type.value}: {net:+,.0f} sat (Trust: {u.trust_score:.0f})")
        
        # By trust score
        users_by_trust = sorted(users, key=lambda u: u.trust_score, reverse=True)
        
        lines.append("\n--- HIGHEST TRUST ---")
        for i, u in enumerate(users_by_trust[:10], 1):
            lines.append(f"  {i}. {u.user_type.value}: Trust {u.trust_score:.0f}")
        
        lines.append("\n--- LOWEST TRUST ---")
        for i, u in enumerate(users_by_trust[-10:], 1):
            lines.append(f"  {i}. {u.user_type.value}: Trust {u.trust_score:.0f}")
        
        return lines
    
    def _generate_conclusions(self) -> List[str]:
        lines = []
        lines.append("\n" + "=" * 40)
        lines.append("8. CONCLUSIONS")
        lines.append("=" * 40)
        
        # Analyze outcomes by user type
        by_type: Dict[UserType, List[User]] = defaultdict(list)
        for user in self.state.users.values():
            by_type[user.user_type].append(user)
        
        # Calculate net outcomes
        outcomes = {}
        for user_type, users in by_type.items():
            if users:
                avg_net = statistics.mean(u.total_earned - u.total_spent for u in users)
                avg_trust = statistics.mean(u.trust_score for u in users)
                outcomes[user_type] = (avg_net, avg_trust)
        
        # Good actors
        lines.append("\n✅ GOOD ACTORS (positive net income & high trust):")
        good_types = [t for t, (net, trust) in outcomes.items() if net > 0 and trust >= 550]
        for t in sorted(good_types, key=lambda x: outcomes[x][0], reverse=True):
            net, trust = outcomes[t]
            lines.append(f"   {t.value}: {net:+,.0f} sat, trust {trust:.0f}")
        
        # Bad actors
        lines.append("\n❌ BAD ACTORS (negative net income or low trust):")
        bad_types = [t for t, (net, trust) in outcomes.items() if net < 0 or trust < 500]
        for t in sorted(bad_types, key=lambda x: outcomes[x][0]):
            net, trust = outcomes[t]
            lines.append(f"   {t.value}: {net:+,.0f} sat, trust {trust:.0f}")
        
        # System health
        lines.append("\n📊 SYSTEM HEALTH INDICATORS:")
        
        # Check if good actors are profitable
        elite_outcome = outcomes.get(UserType.ELITE_CREATOR, (0, 0))
        spammer_outcome = outcomes.get(UserType.AD_SPAMMER, (0, 0))
        
        if elite_outcome[0] > spammer_outcome[0]:
            lines.append("   ✅ Elite creators earn more than spammers")
        else:
            lines.append("   ❌ WARNING: Spammers may be gaming the system")
        
        if spammer_outcome[0] < 0:
            lines.append("   ✅ Spamming is unprofitable")
        else:
            lines.append("   ❌ WARNING: Spamming is still profitable")
        
        cabal_outcome = outcomes.get(UserType.CABAL_MEMBER, (0, 0))
        normal_outcome = outcomes.get(UserType.NORMAL, (0, 0))
        
        if cabal_outcome[0] < normal_outcome[0]:
            lines.append("   ✅ Cabal manipulation is less profitable than normal use")
        else:
            lines.append("   ⚠️  Cabal manipulation may need stronger countermeasures")
        
        toxic_outcome = outcomes.get(UserType.TOXIC_CREATOR, (0, 0))
        if toxic_outcome[0] < 0:
            lines.append("   ✅ Toxic content creation is unprofitable")
        else:
            lines.append("   ❌ WARNING: Toxic content may still be rewarded")
        
        # Final verdict
        good_count = len(good_types)
        bad_count = len(bad_types)
        
        lines.append(f"\n🏁 FINAL VERDICT:")
        if good_count > bad_count and spammer_outcome[0] < 0:
            lines.append("   The economic system appears to be WORKING AS INTENDED.")
            lines.append("   Good actors are rewarded, bad actors are punished.")
        else:
            lines.append("   The economic system needs FURTHER TUNING.")
            lines.append("   Some bad actors may still be profitable.")
        
        return lines
    
    def _calculate_gini(self, values: List[float]) -> float:
        """Calculate Gini coefficient (0 = perfect equality, 1 = perfect inequality)"""
        if not values:
            return 0
        
        n = len(values)
        values = sorted(values)
        
        # Calculate using formula: G = (2 * sum(i * x_i) - (n + 1) * sum(x_i)) / (n * sum(x_i))
        total = sum(values)
        if total == 0:
            return 0
        
        weighted_sum = sum((i + 1) * x for i, x in enumerate(values))
        gini = (2 * weighted_sum - (n + 1) * total) / (n * total)
        
        return gini
    
    def _export_user_csv(self, filename: str):
        """Export all users' trust scores and economics to CSV"""
        import csv
        users = sorted(
            self.state.users.values(),
            key=lambda u: (u.user_type.value, u.total_earned - u.total_spent),
            reverse=True,
        )
        with open(filename, 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow([
                'type', 'id', 'trust_score', 'tier',
                'creator', 'curator', 'juror', 'risk',
                'balance', 'earned', 'spent', 'penalty', 'net',
                'posts', 'likes', 'comments', 'challenges_won', 'challenges_lost',
                'violations', 'days_active',
            ])
            for u in users:
                w.writerow([
                    u.user_type.value, u.id,
                    round(u.trust_score, 1), u.trust_tier.value,
                    round(u.reputation.creator, 1),
                    round(u.reputation.curator, 1),
                    round(u.reputation.juror, 1),
                    round(u.reputation.risk, 1),
                    round(u.balance), round(u.total_earned),
                    round(u.total_spent), round(u.total_penalty),
                    round(u.total_earned - u.total_spent),
                    u.posts_created, u.likes_given, u.comments_made,
                    u.challenges_won, u.challenges_lost,
                    u.violations_committed, u.days_active,
                ])
        print(f"User CSV exported to {filename} ({len(users)} users)")

    def _save_raw_data(self, filename: str):
        """Save raw simulation data as JSON"""
        data = {
            'summary': {
                'days': self.state.current_day,
                'users': len(self.state.users),
                'content': len(self.state.content),
                'challenges': len(self.state.challenges),
                'spam_index': self.state.spam_index,
            },
            'user_type_stats': {},
            'daily_metrics': [],
        }
        
        # User type statistics
        by_type: Dict[UserType, List[User]] = defaultdict(list)
        for user in self.state.users.values():
            by_type[user.user_type].append(user)
        
        for user_type, users in by_type.items():
            if users:
                data['user_type_stats'][user_type.value] = {
                    'count': len(users),
                    'avg_balance': statistics.mean(u.balance for u in users),
                    'avg_earned': statistics.mean(u.total_earned for u in users),
                    'avg_spent': statistics.mean(u.total_spent for u in users),
                    'avg_trust': statistics.mean(u.trust_score for u in users),
                    'avg_creator_score': statistics.mean(u.reputation.creator for u in users),
                    'avg_curator_score': statistics.mean(u.reputation.curator for u in users),
                    'avg_risk_score': statistics.mean(u.reputation.risk for u in users),
                }
        
        # Daily metrics (sample every 7 days to reduce size)
        for i, m in enumerate(self.state.daily_metrics):
            if i % 7 == 0:
                data['daily_metrics'].append({
                    'day': m.day,
                    'active_users': m.active_users,
                    'posts': m.posts_created,
                    'likes': m.likes_given,
                    'challenges': m.challenges_initiated,
                    'violations': m.violations_caught,
                    'white': m.white_count,
                    'green': m.green_count,
                    'blue': m.blue_count,
                    'purple': m.purple_count,
                    'orange': m.orange_count,
                })
        
        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"Raw data saved to {filename}")
