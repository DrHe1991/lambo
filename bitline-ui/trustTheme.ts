export type TrustTier = 'white' | 'green' | 'blue' | 'purple' | 'orange';

export interface TrustTierConfig {
  tier: TrustTier;
  minScore: number; // 0-1000 scale
  maxScore: number; // 0-1000 scale
  label: string;
}

export const TRUST_TIER_CONFIGS: TrustTierConfig[] = [
  { tier: 'white', minScore: 0, maxScore: 399, label: 'White' },
  { tier: 'green', minScore: 400, maxScore: 599, label: 'Green' },
  { tier: 'blue', minScore: 600, maxScore: 749, label: 'Blue' },
  { tier: 'purple', minScore: 750, maxScore: 899, label: 'Purple' },
  { tier: 'orange', minScore: 900, maxScore: 1000, label: 'Orange' },
];

export const getTrustTier = (score: number): TrustTier => {
  // score on 0-1000 scale
  if (score >= 900) return 'orange';
  if (score >= 750) return 'purple';
  if (score >= 600) return 'blue';
  if (score >= 400) return 'green';
  return 'white';
};

export const getTrustRingClass = (score: number): string => {
  switch (getTrustTier(score)) {
    case 'orange':
      return 'bg-orange-500';
    case 'purple':
      return 'bg-purple-500';
    case 'blue':
      return 'bg-blue-500';
    case 'green':
      return 'bg-green-500';
    default:
      return 'bg-zinc-200';
  }
};

export const getTrustBadgeClass = (score: number): string => {
  switch (getTrustTier(score)) {
    case 'orange':
      return 'text-orange-300 border-orange-400/40 bg-orange-500/10';
    case 'purple':
      return 'text-purple-300 border-purple-400/40 bg-purple-500/10';
    case 'blue':
      return 'text-blue-300 border-blue-400/40 bg-blue-500/10';
    case 'green':
      return 'text-green-300 border-green-400/40 bg-green-500/10';
    default:
      return 'text-zinc-200 border-zinc-400/40 bg-zinc-500/10';
  }
};

export const getTrustStrokeColor = (score: number): string => {
  switch (getTrustTier(score)) {
    case 'orange': return '#f97316';
    case 'purple': return '#a855f7';
    case 'blue': return '#3b82f6';
    case 'green': return '#22c55e';
    default: return '#a1a1aa';
  }
};

export const getTrustBadgeBg = (score: number): string => {
  switch (getTrustTier(score)) {
    case 'orange': return 'bg-orange-500';
    case 'purple': return 'bg-purple-500';
    case 'blue': return 'bg-blue-500';
    case 'green': return 'bg-green-500';
    default: return 'bg-zinc-500';
  }
};
