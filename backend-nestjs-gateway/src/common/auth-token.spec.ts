import { scryptSync } from 'node:crypto';
import { createOpaqueToken, hashOpaqueToken, hashPassword, needsPasswordHashUpgrade, signAccessToken, signPurposeToken, verifyAccessToken, verifyPassword, verifyPurposeToken } from './auth-token';

describe('auth token primitives', () => {
  it('hashes new passwords with Argon2id and verifies them', async () => {
    const encoded = await hashPassword('a-long-password');
    expect(encoded).toMatch(/^\$argon2id\$/);
    expect(needsPasswordHashUpgrade(encoded)).toBe(false);
    await expect(verifyPassword('a-long-password', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', encoded)).resolves.toBe(false);
  });

  it('verifies legacy scrypt passwords for transparent login migration', async () => {
    const salt = '0123456789abcdef0123456789abcdef';
    const encoded = `scrypt$${salt}$${scryptSync('legacy-password', salt, 32).toString('hex')}`;
    expect(needsPasswordHashUpgrade(encoded)).toBe(true);
    await expect(verifyPassword('legacy-password', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', encoded)).resolves.toBe(false);
    await expect(verifyPassword('password', 'malformed-hash')).resolves.toBe(false);
  });

  it('verifies PHC hashes produced by the previous Argon2id implementation', async () => {
    const priorLibraryHash = '$argon2id$v=19$m=65536,p=4,t=3$S241dk1RVzgRn63V/lIalA$9yAObNIM3zi8EZVfnyo/a47T/jsC+ytaGleylRZAfCc';
    await expect(verifyPassword('argon2-interop-fixture-password', priorLibraryHash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', priorLibraryHash)).resolves.toBe(false);
  });

  it('issues a signed JWT-shaped access token', () => {
    expect(signAccessToken({ sub: 'user', tenant: 'tenant', roles: [], sid: 'session' }, 'secret').split('.')).toHaveLength(3);
  });

  it('verifies a signed token and rejects a tampered one', () => {
    const token = signAccessToken({ sub: 'user-1', tenant: 'alpha', roles: ['admin'], sid: 'session-1' }, 'secret');
    expect(verifyAccessToken(token, 'secret')).toMatchObject({ sub: 'user-1', tenant: 'alpha', roles: ['admin'] });
    expect(verifyAccessToken(`${token}x`, 'secret')).toBeUndefined();
  });

  it('binds one-time tokens to their purpose', () => {
    const token = signPurposeToken({ sub: 'user-1', tenant: 'alpha', purpose: 'staff-invite' }, 'secret', 300);
    expect(verifyPurposeToken(token, 'secret', 'staff-invite')).toMatchObject({ sub: 'user-1', tenant: 'alpha' });
    expect(verifyPurposeToken(token, 'secret', 'password-reset')).toBeUndefined();
  });

  it('creates opaque tokens and stores only a stable hash', () => {
    const token = createOpaqueToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hashOpaqueToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOpaqueToken(token)).not.toContain(token);
  });
});
