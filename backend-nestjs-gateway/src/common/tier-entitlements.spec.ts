import { normalizeTierCode, rolesForTier, tierAllows } from './tier-entitlements';

describe('subscription tier entitlements', () => {
  it('normalizes customer-facing plan names to canonical tier codes', () => {
    expect(normalizeTierCode('Basic')).toBe('starter');
    expect(normalizeTierCode('Premium')).toBe('growth');
    expect(normalizeTierCode('Ultra Premium')).toBe('enterprise');
  });

  it('does not permit lower tiers to use higher-tier capabilities', () => {
    expect(tierAllows('starter', 'growth')).toBe(false);
    expect(tierAllows('growth', 'enterprise')).toBe(false);
    expect(tierAllows('enterprise', 'starter')).toBe(true);
  });

  it('exposes advanced employee roles only on eligible plans', () => {
    expect(rolesForTier('starter')).not.toContain('coach');
    expect(rolesForTier('starter')).not.toContain('biller');
    expect(rolesForTier('growth')).toContain('lead_trainer');
    expect(rolesForTier('growth')).not.toContain('accountant');
    expect(rolesForTier('enterprise')).toEqual(expect.arrayContaining(['biller', 'accountant']));
  });
});
