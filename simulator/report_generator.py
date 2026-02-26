"""
BitLink Simulator - Report Generator
Generates clean Markdown reports from simulation results
"""

import os
from datetime import datetime
from typing import Dict, List, Optional
from collections import defaultdict
from statistics import mean

from config import UserType, TrustTier, get_trust_tier
from models import SimulationState, User


class ReportGenerator:
    """Generate clean Markdown reports from simulation state"""

    def __init__(self, state: SimulationState, experiment_name: str = '', audit_data: Optional[Dict] = None):
        self.state = state
        # 格式: YYYYMMDD_HHMMSS_name.md (时间戳在前，方便排序)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        if experiment_name:
            self.experiment_name = f'{timestamp}_{experiment_name}'
        else:
            self.experiment_name = f'{timestamp}_sim'
        self.audit_data = audit_data or {}
        self.results_dir = os.path.join(os.path.dirname(__file__), 'results')
        os.makedirs(self.results_dir, exist_ok=True)

    def generate(self, extra_metadata: Optional[Dict] = None) -> str:
        """Generate and save report, returns filepath"""
        lines = []

        lines.extend(self._header(extra_metadata))
        lines.extend(self._overview())
        lines.extend(self._fund_audit())
        lines.extend(self._economics())
        lines.extend(self._user_rankings())
        lines.extend(self._trust_distribution())
        lines.extend(self._cabal_analysis())
        lines.extend(self._health_check())
        lines.extend(self._footer())

        report = '\n'.join(lines)
        filepath = os.path.join(self.results_dir, f'{self.experiment_name}.md')

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(report)

        print(f'Report saved: {filepath}')
        return filepath

    def _header(self, extra_metadata: Optional[Dict] = None) -> List[str]:
        lines = [
            f'# BitLink 模拟报告: {self.experiment_name}',
            '',
            f'**生成时间**: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}  ',
            f'**模拟周期**: {self.state.current_day} 天  ',
            f'**用户规模**: {len(self.state.users)} 人',
            '',
        ]

        if extra_metadata:
            lines.append('**实验参数**:')
            for k, v in extra_metadata.items():
                lines.append(f'- {k}: `{v}`')
            lines.append('')

        lines.append('---')
        lines.append('')
        return lines

    def _overview(self) -> List[str]:
        users = list(self.state.users.values())
        total_balance = sum(u.balance for u in users)
        active_users = self.state.daily_metrics[-1].active_users if self.state.daily_metrics else 0
        challenges = list(self.state.challenges.values())
        violations = sum(1 for c in challenges if c.penalty_amount > 0)

        return [
            '## 概览',
            '',
            '| 指标 | 数值 |',
            '|------|------|',
            f'| 用户总余额 | {total_balance:,.0f} sat |',
            f'| 平均余额 | {total_balance / len(users):,.0f} sat |',
            f'| 最终日活 | {active_users} |',
            f'| 内容总数 | {len(self.state.content):,} |',
            f'| 举报总数 | {len(challenges):,} (违规: {violations}) |',
            f'| Spam Index | {self.state.spam_index:.4f} |',
            '',
        ]

    def _fund_audit(self) -> List[str]:
        """资金审计部分"""
        users = list(self.state.users.values())
        total_balance = sum(u.balance for u in users)
        total_earned = sum(u.total_earned for u in users)
        total_spent = sum(u.total_spent for u in users)
        total_penalty = sum(u.total_penalty for u in users)

        initial = self.audit_data.get('initial_balance', 0)
        deposits = self.audit_data.get('total_deposits', 0)
        external = initial + deposits
        platform_emission = total_earned - total_spent + total_penalty

        expected = initial + deposits - total_spent + total_earned - total_penalty
        diff = total_balance - expected
        is_balanced = abs(diff) < 1

        lines = [
            '## 资金审计',
            '',
            '### 外部流入',
            '| 来源 | 金额 |',
            '|------|------|',
            f'| 初始余额 | {initial:,.0f} sat |',
            f'| 用户充值 | {deposits:,.0f} sat |',
            f'| **小计** | **{external:,.0f} sat** |',
            '',
            '### 系统内流转',
            '| 项目 | 金额 |',
            '|------|------|',
            f'| 用户支出 | {total_spent:,.0f} sat |',
            f'| 用户收入 | {total_earned:,.0f} sat |',
            f'| 用户罚没 | {total_penalty:,.0f} sat |',
            f'| **平台增发** | **{platform_emission:,.0f} sat** |',
            '',
            '### 守恒校验',
            f'- 预期余额: {expected:,.0f} sat',
            f'- 实际余额: {total_balance:,.0f} sat',
            f'- 差额: {diff:+,.0f} sat',
            f'- 状态: {"✅ 守恒" if is_balanced else "⚠️ 存在差额"}',
            '',
        ]

        return lines

    def _economics(self) -> List[str]:
        users = list(self.state.users.values())
        balances = sorted([u.balance for u in users])
        n = len(balances)

        def percentile(p):
            idx = int(n * p / 100)
            return balances[min(idx, n - 1)]

        gini = self._calc_gini(balances)

        return [
            '## 财富分布',
            '',
            '| 百分位 | 余额 |',
            '|--------|------|',
            f'| 10% | {percentile(10):,.0f} sat |',
            f'| 25% | {percentile(25):,.0f} sat |',
            f'| 50% | {percentile(50):,.0f} sat |',
            f'| 75% | {percentile(75):,.0f} sat |',
            f'| 90% | {percentile(90):,.0f} sat |',
            f'| 95% | {percentile(95):,.0f} sat |',
            f'| 99% | {percentile(99):,.0f} sat |',
            '',
            f'**基尼系数**: {gini:.3f}',
            '',
        ]

    def _user_rankings(self) -> List[str]:
        by_type: Dict[UserType, List[User]] = defaultdict(list)
        for u in self.state.users.values():
            by_type[u.user_type].append(u)

        results = []
        for ut, users in by_type.items():
            if not users:
                continue
            avg_net = mean(u.total_earned - u.total_spent for u in users)
            avg_trust = mean(u.trust_score for u in users)
            results.append((ut, len(users), avg_net, avg_trust))

        results.sort(key=lambda x: x[2], reverse=True)

        lines = [
            '## 用户类型表现',
            '',
            '| 排名 | 类型 | 人数 | 净收益/人 | 平均Trust |',
            '|------|------|------|-----------|-----------|',
        ]

        for i, (ut, count, net, trust) in enumerate(results, 1):
            emoji = '🏆' if i <= 3 else ('💀' if net < 0 else '')
            lines.append(f'| {emoji} {i} | {ut.value} | {count} | {net:+,.0f} sat | {trust:.0f} |')

        lines.append('')
        return lines

    def _trust_distribution(self) -> List[str]:
        tiers = defaultdict(int)
        for u in self.state.users.values():
            tiers[u.trust_tier] += 1

        total = len(self.state.users)
        lines = [
            '## Trust 分布',
            '',
            '### 按 Tier',
            '',
            '| Tier | 人数 | 占比 |',
            '|------|------|------|',
        ]

        for tier in [TrustTier.WHITE, TrustTier.GREEN, TrustTier.BLUE, TrustTier.PURPLE, TrustTier.ORANGE]:
            count = tiers[tier]
            pct = count / total * 100 if total > 0 else 0
            lines.append(f'| {tier.value} | {count} | {pct:.1f}% |')

        lines.append('')
        
        # 按分数段统计
        score_ranges = [
            (900, 1000, '900-1000'),
            (800, 899, '800-899'),
            (700, 799, '700-799'),
            (600, 699, '600-699'),
            (500, 599, '500-599'),
            (400, 499, '400-499'),
            (300, 399, '300-399'),
            (0, 299, '0-299'),
        ]
        
        score_counts = defaultdict(int)
        for u in self.state.users.values():
            score = int(u.trust_score)
            for low, high, label in score_ranges:
                if low <= score <= high:
                    score_counts[label] += 1
                    break
        
        lines.extend([
            '### 按分数段',
            '',
            '| 分数段 | 人数 | 占比 |',
            '|--------|------|------|',
        ])
        
        for low, high, label in score_ranges:
            count = score_counts[label]
            pct = count / total * 100 if total > 0 else 0
            lines.append(f'| {label} | {count} | {pct:.1f}% |')
        
        lines.append('')
        return lines

    def _cabal_analysis(self) -> List[str]:
        total = len(self.state.cabals)
        detected = sum(1 for c in self.state.cabals.values() if c.detected)

        cabal_users = [u for u in self.state.users.values() if u.user_type == UserType.CABAL_MEMBER]
        normal_users = [u for u in self.state.users.values() if u.user_type == UserType.NORMAL]

        lines = [
            '## Cabal 分析',
            '',
            f'- 总 Cabal 组数: {total}',
            f'- 已检测: {detected} ({detected / max(1, total) * 100:.0f}%)',
            '',
        ]

        if cabal_users:
            cabal_avg = mean(u.balance for u in cabal_users)
            cabal_risk = mean(u.reputation.risk for u in cabal_users)
            normal_avg = mean(u.balance for u in normal_users) if normal_users else 0

            lines.extend([
                '| 指标 | Cabal成员 | 普通用户 |',
                '|------|-----------|----------|',
                f'| 平均余额 | {cabal_avg:,.0f} sat | {normal_avg:,.0f} sat |',
                f'| 平均Risk | {cabal_risk:.0f} | - |',
                '',
            ])

        return lines

    def _health_check(self) -> List[str]:
        by_type: Dict[UserType, List[User]] = defaultdict(list)
        for u in self.state.users.values():
            by_type[u.user_type].append(u)

        def avg_net(ut):
            users = by_type.get(ut, [])
            return mean(u.total_earned - u.total_spent for u in users) if users else 0

        elite = avg_net(UserType.ELITE_CREATOR)
        spammer = avg_net(UserType.AD_SPAMMER)
        cabal = avg_net(UserType.CABAL_MEMBER)
        normal = avg_net(UserType.NORMAL)
        toxic = avg_net(UserType.TOXIC_CREATOR)

        checks = [
            ('优质创作者 > 垃圾制造者', elite > spammer),
            ('刷量行为无利可图', spammer < 0),
            ('Cabal收益 < 普通用户', cabal < normal),
            ('恶意内容无利可图', toxic < 0),
        ]

        lines = [
            '## 系统健康检查',
            '',
        ]

        all_pass = True
        for desc, passed in checks:
            icon = '✅' if passed else '❌'
            lines.append(f'- {icon} {desc}')
            if not passed:
                all_pass = False

        lines.append('')
        if all_pass:
            lines.append('**结论**: 经济系统运行正常，激励机制符合预期。')
        else:
            lines.append('**结论**: 部分指标异常，需进一步调参。')

        lines.append('')
        return lines

    def _footer(self) -> List[str]:
        return [
            '---',
            '',
            '*此报告由 BitLink Simulator 自动生成*',
        ]

    def _calc_gini(self, values: List[float]) -> float:
        if not values:
            return 0
        n = len(values)
        values = sorted(values)
        total = sum(values)
        if total == 0:
            return 0
        weighted = sum((i + 1) * x for i, x in enumerate(values))
        return (2 * weighted - (n + 1) * total) / (n * total)


def generate_report(
    state: SimulationState,
    name: str = '',
    metadata: Optional[Dict] = None,
    audit_data: Optional[Dict] = None
) -> str:
    """Convenience function to generate report"""
    gen = ReportGenerator(state, name, audit_data)
    return gen.generate(metadata)
