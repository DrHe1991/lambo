export type TrustTier = 'white' | 'green' | 'blue' | 'purple' | 'orange';

export interface TrustTierConfig {
  tier: TrustTier;
  minScore: number; // score is on 0-100 scale
  maxScore: number; // score is on 0-100 scale
  label: string;
}

export const TRUST_TIER_CONFIGS: TrustTierConfig[] = [
  { tier: 'white', minScore: 0, maxScore: 39, label: 'White' },
  { tier: 'green', minScore: 40, maxScore: 59, label: 'Green' },
  { tier: 'blue', minScore: 60, maxScore: 74, label: 'Blue' },
  { tier: 'purple', minScore: 75, maxScore: 89, label: 'Purple' },
  { tier: 'orange', minScore: 90, maxScore: 100, label: 'Orange' }
];

export const getTrustTier = (score: number): TrustTier => {
  if (score >= 90) return 'orange';
  if (score >= 75) return 'purple';
  if (score >= 60) return 'blue';
  if (score >= 40) return 'green';
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
