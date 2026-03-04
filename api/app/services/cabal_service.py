"""
Cabal Detection & Penalty Service

Detects coordinated manipulation groups (cabals) and applies penalties.

Detection criteria:
- internal_ratio > 3 (group interactions / external interactions)
- avg_internal_interactions > 50 per member
- member risk_score > 80

Penalties:
- Risk +150~500 (leaders get more)
- Creator -500~1500
- Balance confiscation 30%~80%
- Like weight ×0.3 for 30 days
"""
from datetime import datetime, timedelta
from collections import defaultdict
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.reward import InteractionLog
from app.models.cabal import CabalGroup, CabalMember, CabalStatus
from app.models.ledger import Ledger, ActionType, RefType
from app.services.trust_service import compute_trust_score


# Detection thresholds
INTERNAL_RATIO_THRESHOLD = 3.0
AVG_INTERNAL_THRESHOLD = 50
MIN_GROUP_SIZE = 3
DETECTION_WINDOW_DAYS = 30

# Penalty configuration
RISK_PENALTY_MEMBER = 150
RISK_PENALTY_LEADER = 500
CREATOR_PENALTY_MEMBER = 500
CREATOR_PENALTY_LEADER = 1500
CONFISCATION_RATE_MEMBER = 0.30
CONFISCATION_RATE_LEADER = 0.80
PENALTY_DURATION_DAYS = 30


class CabalDetectionService:
    """Detects and penalizes coordinated manipulation groups."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def run_detection(self) -> dict:
        """Run cabal detection algorithm.
        
        Returns summary of detected groups and penalties applied.
        """
        window_start = datetime.utcnow() - timedelta(days=DETECTION_WINDOW_DAYS)
        
        # 1. Build interaction graph
        interactions = await self._get_recent_interactions(window_start)
        user_graph = self._build_interaction_graph(interactions)
        
        # 2. Find suspicious clusters
        clusters = self._find_clusters(user_graph)
        
        # 3. Evaluate each cluster
        detected_groups = []
        for cluster in clusters:
            if len(cluster) < MIN_GROUP_SIZE:
                continue
                
            metrics = self._calculate_cluster_metrics(cluster, user_graph)
            
            if self._is_cabal(metrics):
                group = await self._create_cabal_group(cluster, metrics)
                detected_groups.append(group)
        
        return {
            'clusters_analyzed': len(clusters),
            'cabals_detected': len(detected_groups),
            'groups': [{'id': g.id, 'members': g.member_count} for g in detected_groups],
        }

    async def apply_penalties(self, group_id: int) -> dict:
        """Apply penalties to a confirmed cabal group.
        
        Returns summary of penalties applied.
        """
        group = await self.db.get(CabalGroup, group_id)
        if not group:
            return {'error': 'Group not found'}
        
        if group.status != CabalStatus.SUSPECTED.value:
            return {'error': f'Group already {group.status}'}
        
        # Get members
        result = await self.db.execute(
            select(CabalMember).where(CabalMember.group_id == group_id)
        )
        members = list(result.scalars().all())
        
        total_confiscated = 0
        penalties_applied = []
        
        for member in members:
            user = await self.db.get(User, member.user_id)
            if not user:
                continue
            
            # Determine penalty severity
            is_leader = member.is_leader
            risk_add = RISK_PENALTY_LEADER if is_leader else RISK_PENALTY_MEMBER
            creator_sub = CREATOR_PENALTY_LEADER if is_leader else CREATOR_PENALTY_MEMBER
            confiscation_rate = CONFISCATION_RATE_LEADER if is_leader else CONFISCATION_RATE_MEMBER
            
            # Apply Risk penalty
            user.risk_score = min(1000, user.risk_score + risk_add)
            member.risk_added = risk_add
            
            # Apply Creator penalty
            user.creator_score = max(0, user.creator_score - creator_sub)
            member.creator_deducted = creator_sub
            
            # Confiscate balance
            confiscate_amount = int(user.available_balance * confiscation_rate)
            if confiscate_amount > 0:
                user.available_balance -= confiscate_amount
                member.balance_confiscated = confiscate_amount
                total_confiscated += confiscate_amount
                
                # Log confiscation in ledger
                self.db.add(Ledger(
                    user_id=user.id,
                    amount=-confiscate_amount,
                    balance_after=user.available_balance,
                    action_type=ActionType.CABAL_PENALTY.value,
                    ref_type=RefType.NONE.value,
                    note=f'Cabal penalty (group {group_id})',
                ))
            
            # Recalculate trust score
            user.trust_score = compute_trust_score(
                user.creator_score, user.curator_score,
                user.juror_score, user.risk_score,
            )
            
            member.penalized_at = datetime.utcnow()
            penalties_applied.append({
                'user_id': user.id,
                'is_leader': is_leader,
                'risk_added': risk_add,
                'creator_deducted': creator_sub,
                'confiscated': confiscate_amount,
            })
        
        # Update group status
        group.status = CabalStatus.CONFIRMED.value
        group.confirmed_at = datetime.utcnow()
        group.total_confiscated = total_confiscated
        group.penalty_expires_at = datetime.utcnow() + timedelta(days=PENALTY_DURATION_DAYS)
        
        await self.db.flush()
        
        return {
            'group_id': group_id,
            'members_penalized': len(penalties_applied),
            'total_confiscated': total_confiscated,
            'penalties': penalties_applied,
        }

    async def check_user_cabal_status(self, user_id: int) -> dict:
        """Check if a user is in an active cabal and return penalty info."""
        result = await self.db.execute(
            select(CabalMember, CabalGroup)
            .join(CabalGroup, CabalMember.group_id == CabalGroup.id)
            .where(
                CabalMember.user_id == user_id,
                CabalGroup.status == CabalStatus.CONFIRMED.value,
            )
        )
        row = result.first()
        
        if not row:
            return {'is_cabal_member': False, 'penalty_multiplier': 1.0}
        
        member, group = row
        
        # Check if penalty period expired
        if group.penalty_expires_at and group.penalty_expires_at < datetime.utcnow():
            return {'is_cabal_member': False, 'penalty_multiplier': 1.0}
        
        return {
            'is_cabal_member': True,
            'group_id': group.id,
            'is_leader': member.is_leader,
            'penalty_multiplier': 0.3,  # Like weight penalty
            'penalty_expires_at': group.penalty_expires_at.isoformat() if group.penalty_expires_at else None,
        }

    async def _get_recent_interactions(self, since: datetime) -> list:
        """Get all interactions within detection window."""
        result = await self.db.execute(
            select(InteractionLog)
            .where(InteractionLog.created_at >= since)
        )
        return list(result.scalars().all())

    def _build_interaction_graph(self, interactions: list) -> dict:
        """Build directed graph of user interactions."""
        graph = defaultdict(lambda: defaultdict(int))
        for interaction in interactions:
            graph[interaction.actor_id][interaction.target_user_id] += 1
        return graph

    def _find_clusters(self, graph: dict) -> list:
        """Find clusters of users with high mutual interactions.
        
        Uses simple heuristic: users who interact with each other
        more than they interact with outsiders.
        """
        clusters = []
        visited = set()
        
        for user_id in graph:
            if user_id in visited:
                continue
            
            # BFS to find connected component with high internal ratio
            cluster = set()
            queue = [user_id]
            
            while queue:
                current = queue.pop(0)
                if current in cluster:
                    continue
                cluster.add(current)
                visited.add(current)
                
                # Add users this user interacts with frequently
                for target, count in graph[current].items():
                    if target not in cluster and count >= 5:  # Min 5 interactions
                        queue.append(target)
            
            if len(cluster) >= MIN_GROUP_SIZE:
                clusters.append(cluster)
        
        return clusters

    def _calculate_cluster_metrics(self, cluster: set, graph: dict) -> dict:
        """Calculate cabal detection metrics for a cluster."""
        internal_count = 0
        external_count = 0
        
        for user_id in cluster:
            for target, count in graph[user_id].items():
                if target in cluster:
                    internal_count += count
                else:
                    external_count += count
        
        internal_ratio = internal_count / max(1, external_count)
        avg_internal = internal_count / max(1, len(cluster))
        
        return {
            'internal_count': internal_count,
            'external_count': external_count,
            'internal_ratio': internal_ratio,
            'avg_internal': avg_internal,
            'member_count': len(cluster),
            'member_ids': list(cluster),
        }

    def _is_cabal(self, metrics: dict) -> bool:
        """Determine if cluster metrics indicate a cabal."""
        return (
            metrics['internal_ratio'] > INTERNAL_RATIO_THRESHOLD and
            metrics['avg_internal'] > AVG_INTERNAL_THRESHOLD
        )

    async def _create_cabal_group(self, cluster: set, metrics: dict) -> CabalGroup:
        """Create a new cabal group with members."""
        # Find leader (most internal interactions)
        leader_id = None
        max_internal = 0
        
        for user_id in cluster:
            user = await self.db.get(User, user_id)
            if user and user.risk_score > max_internal:
                leader_id = user_id
                max_internal = user.risk_score
        
        # Create group
        group = CabalGroup(
            internal_ratio=metrics['internal_ratio'],
            avg_internal_interactions=metrics['avg_internal'],
            member_count=len(cluster),
            detection_notes=f"Detected via clustering: ratio={metrics['internal_ratio']:.2f}, avg={metrics['avg_internal']:.1f}",
        )
        self.db.add(group)
        await self.db.flush()
        
        # Add members
        for user_id in cluster:
            member = CabalMember(
                group_id=group.id,
                user_id=user_id,
                is_leader=(user_id == leader_id),
            )
            self.db.add(member)
        
        await self.db.flush()
        return group


async def run_cabal_detection(db: AsyncSession) -> dict:
    """Convenience function for scheduler."""
    service = CabalDetectionService(db)
    return await service.run_detection()
