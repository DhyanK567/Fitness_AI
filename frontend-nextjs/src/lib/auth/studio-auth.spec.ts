import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractSession,
  getApiErrorCode,
  getMfaTicket,
  isWorkspacePathAllowed,
  normalizeStudioRole,
  PASSWORD_RULES,
  resolveStudioRole,
  slugifyStudioName,
  studioRoleHome,
  toBrowserSessionPayload,
} from './studio-auth';

test('slugifyStudioName creates the same bounded tenant preview as registration', () => {
  assert.equal(slugifyStudioName('  Prana Yoga & Shala  '), 'prana-yoga-shala');
  assert.equal(slugifyStudioName('A'.repeat(50)).length, 35);
});

test('password policy requires every advertised rule', () => {
  assert.equal(PASSWORD_RULES.every((rule) => rule.test('StrongPass1!')), true);
  assert.equal(PASSWORD_RULES.every((rule) => rule.test('weakpassword')), false);
});

test('extractSession supports wrapped API responses and resolves routes by role', () => {
  const session = extractSession({ data: { data: { access_token: 'token', roles: ['front_desk'], tenant_code: 'fitness-workspace' } } });
  assert.ok(session);
  assert.equal(resolveStudioRole(session), 'front_desk');
  assert.equal(session.tenant_code, 'fitness-workspace');
});

test('getApiErrorCode preserves structured MFA errors', () => {
  assert.equal(getApiErrorCode({ error: { code: 'MFA_REQUIRED' } }), 'MFA_REQUIRED');
  assert.equal(getMfaTicket({ error: { code: 'MFA_REQUIRED', mfaTicket: 'signed.challenge.token' } }), 'signed.challenge.token');
});

test('browser session payload never exposes the refresh token', () => {
  assert.deepEqual(
    toBrowserSessionPayload({ access_token: 'access', refresh_token: 'sensitive', roles: ['owner'] }),
    { access_token: 'access', roles: ['owner'] },
  );
});

test('role aliases normalize to the production workspace roles', () => {
  assert.equal(normalizeStudioRole('Studio Manager'), 'admin');
  assert.equal(normalizeStudioRole('front-desk'), 'front_desk');
  assert.equal(normalizeStudioRole('coach'), 'coach');
  assert.equal(normalizeStudioRole('lead trainer'), 'lead_trainer');
  assert.equal(normalizeStudioRole('biller'), 'biller');
  assert.equal(normalizeStudioRole('unknown'), null);
});

test('each role is confined to its own workspace', () => {
  assert.equal(isWorkspacePathAllowed('owner', '/admin/payments'), true);
  assert.equal(isWorkspacePathAllowed('admin', '/staff/dashboard'), false);

  assert.equal(isWorkspacePathAllowed('staff', '/staff/dashboard'), true);
  assert.equal(isWorkspacePathAllowed('front_desk', '/staff/dashboard'), true);
  assert.equal(isWorkspacePathAllowed('staff', '/admin/dashboard'), false);

  assert.equal(isWorkspacePathAllowed('trainer', '/trainer/dashboard'), true);
  assert.equal(isWorkspacePathAllowed('lead_trainer', '/trainer/dashboard'), true);
  assert.equal(isWorkspacePathAllowed('biller', '/staff/dashboard'), true);
  assert.equal(isWorkspacePathAllowed('trainer', '/admin/reports'), false);
});

test('role homes always target the canonical workspace dashboard', () => {
  assert.equal(studioRoleHome('owner'), '/admin/dashboard');
  assert.equal(studioRoleHome('front_desk'), '/staff/dashboard');
  assert.equal(studioRoleHome('staff'), '/staff/dashboard');
  assert.equal(studioRoleHome('trainer'), '/trainer/dashboard');
  assert.equal(studioRoleHome('lead_trainer'), '/trainer/dashboard');
  assert.equal(studioRoleHome('biller'), '/staff/dashboard');
});
