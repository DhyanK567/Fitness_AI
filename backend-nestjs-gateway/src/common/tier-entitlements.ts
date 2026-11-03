export const TIER_CODES = ['starter', 'growth', 'enterprise'] as const;
export type TierCode = (typeof TIER_CODES)[number];

export const TIER_LABELS: Record<TierCode, string> = {
  starter: 'Basic',
  growth: 'Premium',
  enterprise: 'Ultra Premium',
};

const TIER_RANK: Record<TierCode, number> = { starter: 0, growth: 1, enterprise: 2 };

export const ROLE_MINIMUM_TIER: Readonly<Record<string, TierCode>> = {
  front_desk: 'starter',
  trainer: 'starter',
  staff: 'starter',
  admin: 'starter',
  coach: 'growth',
  lead_trainer: 'growth',
  biller: 'enterprise',
  accountant: 'enterprise',
};

export function normalizeTierCode(value?: string | null): TierCode {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'enterprise' || normalized === 'ultra' || normalized === 'ultra_premium') return 'enterprise';
  if (normalized === 'growth' || normalized === 'premium') return 'growth';
  return 'starter';
}

export function tierAllows(current: TierCode, required: TierCode): boolean {
  return TIER_RANK[current] >= TIER_RANK[required];
}

export function rolesForTier(tier: TierCode): string[] {
  return Object.entries(ROLE_MINIMUM_TIER)
    .filter(([, required]) => tierAllows(tier, required))
    .map(([role]) => role);
}
