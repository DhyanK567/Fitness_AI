import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyStaffSessionJwt } from './edge-session';

function token(payload: Record<string, unknown>, secret: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

test('middleware verification trusts only a valid signed, unexpired gateway session', async () => {
  const now = 2_000_000_000;
  const jwt = token({ sub: 'user-1', tenant: 'tenant-1', sid: 'session-1', roles: ['trainer'], role: 'trainer', iat: now, exp: now + 3600 }, 'test-secret');
  assert.equal((await verifyStaffSessionJwt(jwt, 'test-secret', now))?.role, 'trainer');
  assert.equal(await verifyStaffSessionJwt(jwt, 'wrong-secret', now), null);
  assert.equal(await verifyStaffSessionJwt(jwt, 'test-secret', now + 3601), null);
});

test('middleware verification rejects role-cookie-style unsigned content', async () => {
  assert.equal(await verifyStaffSessionJwt('trainer', 'test-secret'), null);
});
