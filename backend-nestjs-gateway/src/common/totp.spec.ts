import { describe, it, expect } from '@jest/globals';
import { base32Decode, base32Encode, buildOtpAuthUrl, generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, totpCode, verifyTotp } from './totp';
import { hashToken } from './auth-token';

describe('TOTP primitives', () => {
  it('round-trips base32 encoding', () => {
    const buffer = Buffer.from('fitness-ai-secret');
    expect(base32Decode(base32Encode(buffer)).toString()).toBe('fitness-ai-secret');
  });

  it('generates a base32 secret of the expected length', () => {
    const secret = generateTotpSecret(20);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret).toHaveLength(32);
  });

  it('produces matching codes and verifies within the skew window', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totpCode(secret, now), { atMillis: now })).toBe(true);
    // previous step is still accepted (±1 window)
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), { atMillis: now })).toBe(true);
    // far-away step is rejected
    expect(verifyTotp(secret, totpCode(secret, now - 120_000), { atMillis: now })).toBe(false);
  });

  it('rejects malformed codes', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '12345')).toBe(false);
  });

  it('builds an otpauth provisioning URI', () => {
    const url = buildOtpAuthUrl('FitnessAI', 'owner@acme.fitness', 'ABCDEF');
    expect(url).toContain('otpauth://totp/FitnessAI%3Aowner%40acme.fitness');
    expect(url).toContain('secret=ABCDEF');
  });

  it('generates unique normalized recovery codes whose hashes match', () => {
    const { plain, hashes } = generateRecoveryCodes(10);
    expect(new Set(plain).size).toBe(10);
    expect(hashes[0]).toBe(hashToken(normalizeRecoveryCode(plain[0])));
    expect(normalizeRecoveryCode('abcde-12345')).toBe('ABCDE12345');
  });
});
