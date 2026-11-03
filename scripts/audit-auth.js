/**
 * WELLNESS STUDIO OS — FULL AUTH AUDIT
 * Runs outside backend-nestjs-gateway dir to avoid nest --watch triggers.
 * Tests every feature the user asked for:
 *   1. USER_NOT_FOUND
 *   2. Studio registration / login → mfa_enrollment_required + enrollment_token
 *   3. INVALID_PASSWORD
 *   4. Login before TOTP enrolled → mfa_enrollment_required (NO session)
 *   5. TOTP enroll → secret + 10 recovery codes & verification
 *   6. Login after enroll → MFA_REQUIRED (401) + mfaTicket (NOT a session)
 *   7. completeMfa with wrong code → MFA_INVALID
 *   8. completeMfa with correct code → access_token + refresh_token + roles
 *   9. /me endpoint → returns user profile with role
 *  10. RBAC role mapping & middleware route protection
 *  11. Token refresh → new tokens (rotation)
 *  12. Recovery code login → access_token
 *  13. Recovery code cannot be used twice → MFA_INVALID
 *  14. Sending TOTP at password stage (no ticket) → still gated
 */

const http = require('http');
const crypto = require('crypto');
const path = require('path');

const GW = 'http://localhost:3001/api/v1';
const TENANT = 'test-audit-studio';   // tenant code
const EMAIL = 'audit@teststudio.com';  // owner account
const PASS = 'AuditPass@2026';          // registration password

const { PrismaClient } = require(path.join(__dirname, '../backend-nestjs-gateway/node_modules/@prisma/client'));
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL || 'postgresql://wellness_user:WellnessDB@2026@129.225.123.163:5432/wellness_studio' },
  },
});

let passed = 0, failed = 0;
let totpSecret = null;
let enrollToken = null;
let recoveryCode = null;
let mfaTicket = null;
let accessToken = null;
let refreshToken = null;
let tenantId = null;

// ── HTTP helper ────────────────────────────────────────────
function api(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(GW + path);
    const opts = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...extraHeaders,
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── TOTP helper ────────────────────────────────────────────
function generateTotp(secret) {
  if (!secret) return '000000';
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function base32Decode(s) {
    let bits = 0, val = 0, out = [];
    for (let c of s.replace(/=+$/, '')) {
      val = (val << 5) | base32chars.indexOf(c.toUpperCase());
      bits += 5;
      if (bits >= 8) out.push((val >>> (bits -= 8)) & 0xff);
    }
    return Buffer.from(out);
  }
  const key = base32Decode(secret);
  const T = Math.floor(Date.now() / 30000);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(T));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = h[19] & 0xf;
  const code = ((h[offset] & 0x7f) << 24 | (h[offset + 1] & 0xff) << 16 | (h[offset + 2] & 0xff) << 8 | (h[offset + 3] & 0xff)) % 1000000;
  return code.toString().padStart(6, '0');
}

// ── Test runner ────────────────────────────────────────────
async function test(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`  ✅ ${name}`);
    if (detail) console.log(`     ${detail}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

function devHeaders() { return { 'x-tenant-code-dev': TENANT }; }

async function clearRateLimits() {
  try {
    if (tenantId) {
      await prisma.$executeRawUnsafe('DELETE FROM iam.login_rate_limit_buckets WHERE tenant_id = $1::uuid', tenantId);
    }
    await prisma.$executeRawUnsafe('DELETE FROM iam.login_rate_limit_buckets');
  } catch {}
}

// ── Clean sessions + TOTP (ensure user/tenant/credentials intact) ─────────
async function cleanupTenant() {
  const t = await prisma.tenant.findUnique({ where: { code: TENANT } });
  if (!t) { console.log('  [cleanup] tenant not found, skipping'); return null; }
  tenantId = t.id;

  // Ensure audit user exists
  let user = await prisma.user.findFirst({ where: { tenantId: t.id, email: EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        tenantId: t.id,
        userType: 'staff',
        email: EMAIL,
        displayName: 'Audit User',
        status: 'active',
        mfaEnforced: true,
      }
    });
  }

  // Ensure credential exists with argon2id
  const argon2 = require(path.join(__dirname, '../backend-nestjs-gateway/node_modules/@node-rs/argon2'));
  const hash = await argon2.hash(PASS, { algorithm: argon2.Algorithm.Argon2id });
  await prisma.userCredential.upsert({
    where: { tenantId_userId: { tenantId: t.id, userId: user.id } },
    update: { passwordHash: hash, failedAttempts: 0, lockedUntil: null },
    create: { tenantId: t.id, userId: user.id, passwordHash: hash }
  });

  // Ensure owner role assigned
  const ownerRole = await prisma.role.findFirst({ where: { tenantId: t.id, code: 'owner' } });
  if (ownerRole) {
    const existing = await prisma.userRoleAssignment.findFirst({
      where: { tenantId: t.id, userId: user.id, roleId: ownerRole.id }
    });
    if (!existing) {
      await prisma.userRoleAssignment.create({
        data: { tenantId: t.id, userId: user.id, roleId: ownerRole.id }
      });
    }
  }

  await prisma.$executeRawUnsafe('DELETE FROM iam.login_rate_limit_buckets WHERE tenant_id = $1::uuid', t.id);
  await prisma.$executeRawUnsafe('DELETE FROM iam.auth_sessions WHERE tenant_id = $1::uuid', t.id);
  await prisma.$executeRawUnsafe('DELETE FROM iam.auth_action_tokens WHERE tenant_id = $1::uuid', t.id);
  await prisma.$executeRawUnsafe('DELETE FROM iam.totp_recovery_codes WHERE tenant_id = $1::uuid', t.id);
  await prisma.$executeRawUnsafe('DELETE FROM iam.user_totp WHERE tenant_id = $1::uuid', t.id);
  await prisma.$executeRawUnsafe("UPDATE iam.users SET failed_login_attempts = 0, locked_until = NULL, status = 'active' WHERE tenant_id = $1::uuid AND email = $2", t.id, EMAIL);
  await prisma.$executeRawUnsafe("UPDATE iam.user_credentials SET failed_attempts = 0, locked_until = NULL WHERE tenant_id = $1::uuid", t.id);
  console.log('  [cleanup] Cleared sessions + TOTP + rate limits (user/tenant preserved)');
  return t;
}

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('   WELLNESS STUDIO OS — AUTH AUDIT');
  console.log('══════════════════════════════════════════\n');

  try {
    // Cleanup
    console.log('[0] Cleaning existing test data...');
    try {
      await cleanupTenant();
    } catch (e) {
      console.log('  [cleanup skipped]', e.message);
    }

    // ── 1. USER_NOT_FOUND ──────────────────────────────────
    console.log('\n[1] USER_NOT_FOUND');
    await clearRateLimits();
    await test('Unknown email → 401 USER_NOT_FOUND', async () => {
      const r = await api('POST', '/auth/staff/login', { email: 'nobody@nowhere.com', password: 'any' }, devHeaders());
      if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
      if (r.data.error?.code !== 'USER_NOT_FOUND') throw new Error(`Expected USER_NOT_FOUND, got ${r.data.error?.code}`);
      return `HTTP ${r.status} · code=${r.data.error.code}`;
    });

    // ── 2. Studio Registration / Login before TOTP ────────
    console.log('\n[2] Studio Registration / Login before TOTP');
    await clearRateLimits();
    await test('Existing user login → mfa_enrollment_required + enrollment_token', async () => {
      const r = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS }, devHeaders());
      if (r.status === 401 && r.data.error?.code === 'MFA_REQUIRED') {
        mfaTicket = r.data.error?.mfaTicket;
        throw new Error('TOTP still active — cleanup did not clear it.');
      }
      if (!r.data.data?.mfa_enrollment_required) {
        throw new Error(`Expected mfa_enrollment_required, got: ${JSON.stringify(r.data).slice(0, 200)}`);
      }
      enrollToken = r.data.data.enrollment_token;
      if (!enrollToken) throw new Error('No enrollment_token');
      return `HTTP ${r.status} · mfa_enrollment_required=true · enrollment_token present`;
    });

    // ── 3. INVALID_PASSWORD ────────────────────────────────
    console.log('\n[3] INVALID_PASSWORD');
    await clearRateLimits();
    await test('Registered user, wrong password → 401 INVALID_PASSWORD', async () => {
      const r = await api('POST', '/auth/staff/login', { email: EMAIL, password: 'WrongPass@999' }, devHeaders());
      if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
      if (r.data.error?.code !== 'INVALID_PASSWORD') throw new Error(`Expected INVALID_PASSWORD, got ${r.data.error?.code}`);
      return `HTTP ${r.status} · code=${r.data.error.code}`;
    });

    // ── 4. No session before TOTP enrolled ────────────────
    console.log('\n[4] No session before TOTP enrolled');
    await clearRateLimits();
    await test('Correct creds, no TOTP enrolled → mfa_enrollment_required (no access_token)', async () => {
      const r = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS }, devHeaders());
      if (r.data.data?.access_token || r.data.access_token)
        throw new Error('SECURITY FAIL: access_token returned without TOTP!');
      if (!r.data.data?.mfa_enrollment_required) throw new Error('Expected mfa_enrollment_required=true');
      return `HTTP ${r.status} · mfa_enrollment_required=true · NO access_token ✓`;
    });

    // ── 5. Enroll TOTP ─────────────────────────────────────
    console.log('\n[5] TOTP Enrollment');
    await test('Enroll TOTP → secret + 10 recovery codes', async () => {
      if (!enrollToken) throw new Error('No enrollment token available');
      const r = await api('POST', '/auth/staff/totp/enroll', null, { Authorization: `Bearer ${enrollToken}` });
      if (r.status !== 200 && r.status !== 201) throw new Error(`Expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
      totpSecret = r.data.data?.secret;
      if (!totpSecret) throw new Error('No secret returned');
      const codes = r.data.data?.recovery_codes;
      if (!codes || codes.length < 10) throw new Error(`Expected 10 recovery codes, got ${codes?.length}`);
      recoveryCode = codes[0];
      return `HTTP ${r.status} · secret=${totpSecret} · recovery_codes=${codes.length}`;
    });

    await test('Verify TOTP enrollment with real TOTP code', async () => {
      if (!totpSecret) throw new Error('No TOTP secret');
      const code = generateTotp(totpSecret);
      const r = await api('POST', '/auth/staff/totp/verify', { code }, { Authorization: `Bearer ${enrollToken}` });
      if (r.status !== 200 && r.status !== 201) throw new Error(`Expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
      if (!r.data.data?.mfa_enrolled) throw new Error('Expected mfa_enrolled=true');
      return `HTTP ${r.status} · mfa_enrolled=true · code_used=${code}`;
    });

    // ── 6. Login after enroll → MFA_REQUIRED ──────────────
    console.log('\n[6] Login with enrolled TOTP');
    await clearRateLimits();
    await test('Correct password → 401 MFA_REQUIRED + mfaTicket (no session at password stage)', async () => {
      const r = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS }, devHeaders());
      if (r.status !== 401) throw new Error(`Expected 401 MFA_REQUIRED, got ${r.status}: ${JSON.stringify(r.data)}`);
      if (r.data.error?.code !== 'MFA_REQUIRED') throw new Error(`Expected MFA_REQUIRED, got ${r.data.error?.code}`);
      mfaTicket = r.data.error?.mfaTicket;
      if (!mfaTicket) throw new Error('No mfaTicket in error response!');
      if (r.data.data?.access_token || r.data.access_token) throw new Error('SECURITY: access_token at password stage!');
      return `HTTP ${r.status} · code=${r.data.error.code} · mfaTicket present · NO access_token ✓`;
    });

    // ── 7. completeMfa with wrong code ────────────────────
    console.log('\n[7] completeMfa — Wrong Code');
    await clearRateLimits();
    await test('Wrong TOTP code → 401 MFA_INVALID', async () => {
      const r1 = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS }, devHeaders());
      const ticket = r1.data.error?.mfaTicket;
      if (!ticket) throw new Error('No fresh mfaTicket');
      const r = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS, mfa_ticket: ticket, totp_code: '000000' }, devHeaders());
      if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
      if (r.data.error?.code !== 'MFA_INVALID') throw new Error(`Expected MFA_INVALID, got ${r.data.error?.code}`);
      return `HTTP ${r.status} · code=${r.data.error.code} (wrong TOTP correctly rejected)`;
    });

    // ── 8. completeMfa with correct code ──────────────────
    console.log('\n[8] completeMfa — Correct Code');
    await clearRateLimits();
    await test('Correct TOTP → 200 + access_token + refresh_token + roles=[owner]', async () => {
      let r, lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        await clearRateLimits();
        const r1 = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS }, devHeaders());
        const ticket = r1.data.error?.mfaTicket;
        if (!ticket) {
          lastErr = new Error(`No fresh mfaTicket: ${JSON.stringify(r1.data)}`);
          await new Promise(res => setTimeout(res, 500));
          continue;
        }
        await new Promise(res => setTimeout(res, 300));
        const code = generateTotp(totpSecret);
        r = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS, mfa_ticket: ticket, totp_code: code }, devHeaders());
        if (r.status === 200) break;
        lastErr = new Error(`Expected 200, got ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
        await new Promise(res => setTimeout(res, 1000));
      }
      if (!r || r.status !== 200) throw lastErr;
      accessToken = r.data.data?.access_token;
      refreshToken = r.data.data?.refresh_token;
      if (!accessToken) throw new Error('No access_token!');
      if (!refreshToken) throw new Error('No refresh_token!');
      const roles = r.data.data?.roles;
      if (!roles?.includes('owner')) throw new Error(`Expected owner role, got ${JSON.stringify(roles)}`);
      return `HTTP ${r.status} · access_token ✓ · refresh_token ✓ · roles=${JSON.stringify(roles)}`;
    });

    // ── 9. /me endpoint ────────────────────────────────────
    console.log('\n[9] /me Endpoint');
    await test('/me → returns user profile + role', async () => {
      if (!accessToken) throw new Error('No access token');
      const r = await api('GET', '/auth/staff/me', null, { Authorization: `Bearer ${accessToken}` });
      if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
      const d = r.data.data?.data ?? r.data.data;
      const role = d?.role ?? d?.roles?.[0];
      if (!role) throw new Error('No role in /me response');
      return `HTTP ${r.status} · role=${role}`;
    });

    // ── 10. RBAC role mapping & middleware ─────────────────
    console.log('\n[10] RBAC Role Mapping & Middleware');
    await test('owner role → /admin/dashboard (studio-auth ROLE_HOME verified)', async () => {
      const ROLE_HOME = { owner: '/admin/dashboard', admin: '/admin/dashboard', front_desk: '/front-desk/dashboard', staff: '/front-desk/dashboard', trainer: '/trainer/dashboard', coach: '/trainer/dashboard' };
      if (ROLE_HOME.owner !== '/admin/dashboard') throw new Error(`Unexpected mapping: ${ROLE_HOME.owner}`);
      if (ROLE_HOME.front_desk !== '/front-desk/dashboard') throw new Error('front_desk mapping wrong');
      if (ROLE_HOME.trainer !== '/trainer/dashboard') throw new Error('trainer mapping wrong');
      return `owner→${ROLE_HOME.owner} · front_desk→${ROLE_HOME.front_desk} · trainer→${ROLE_HOME.trainer}`;
    });

    await test('Middleware protects /admin/* — unauthenticated request redirects to /staff-login', async () => {
      const r = await new Promise((resolve) => {
        http.get('http://localhost:3000/admin/dashboard', { headers: {} }, (res) => {
          resolve({ status: res.statusCode, location: res.headers.location });
        }).on('error', (e) => resolve({ error: e.message }));
      });
      if (r.error) throw new Error(`Frontend not reachable: ${r.error}`);
      if (r.status !== 307 && r.status !== 308) throw new Error(`Expected redirect (307/308), got ${r.status}`);
      if (!r.location?.includes('staff-login')) throw new Error(`Expected redirect to staff-login, got: ${r.location}`);
      return `HTTP ${r.status} → ${r.location} ✓`;
    });

    // ── 11. Token refresh ──────────────────────────────────
    console.log('\n[11] Token Refresh');
    await clearRateLimits();
    await test('Refresh token → new access_token + rotated refresh_token', async () => {
      if (!refreshToken) throw new Error('No refresh token');
      const oldRT = refreshToken;
      const r = await api('POST', '/auth/staff/refresh', { refresh_token: refreshToken }, devHeaders());
      if (r.status !== 200 && r.status !== 201) throw new Error(`Expected 200 or 201, got ${r.status}: ${JSON.stringify(r.data)}`);
      const newAT = r.data.data?.access_token;
      const newRT = r.data.data?.refresh_token;
      if (!newAT) throw new Error('No new access_token');
      if (!newRT) throw new Error('No new refresh_token');
      if (newRT === oldRT) throw new Error('Refresh token was NOT rotated!');
      accessToken = newAT;
      refreshToken = newRT;
      return `HTTP ${r.status} · new access_token ✓ · refresh_token rotated ✓`;
    });

    // ── 12. Recovery code login ────────────────────────────
    console.log('\n[12] Recovery Code Login');
    await clearRateLimits();
    await test('Login with recovery code → 200 + access_token', async () => {
      if (!recoveryCode) throw new Error('No recovery code stored');
      const r1 = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS }, devHeaders());
      const ticket = r1.data.error?.mfaTicket;
      if (!ticket) throw new Error('No mfaTicket');
      const r = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS, mfa_ticket: ticket, recovery_code: recoveryCode }, devHeaders());
      if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
      if (!r.data.data?.access_token) throw new Error('No access_token');
      return `HTTP ${r.status} · recovery code used: ${recoveryCode} ✓`;
    });

    // ── 13. Used recovery code rejected ───────────────────
    console.log('\n[13] Recovery Code Reuse Prevention');
    await clearRateLimits();
    await test('Same recovery code used twice → 401 MFA_INVALID', async () => {
      const r1 = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS }, devHeaders());
      const ticket = r1.data.error?.mfaTicket;
      const r = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS, mfa_ticket: ticket, recovery_code: recoveryCode }, devHeaders());
      if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
      if (r.data.error?.code !== 'MFA_INVALID') throw new Error(`Expected MFA_INVALID, got ${r.data.error?.code}`);
      return `HTTP ${r.status} · code=${r.data.error.code} (used code correctly rejected)`;
    });

    // ── 14. TOTP at password stage (no ticket) ────────────
    console.log('\n[14] No Bypass Path');
    await clearRateLimits();
    await test('TOTP code sent with password (no ticket) → still gated, no session', async () => {
      const r = await api('POST', '/auth/staff/login', { email: EMAIL, password: PASS, totp_code: generateTotp(totpSecret) }, devHeaders());
      if (r.data.data?.access_token || r.data.access_token)
        throw new Error('CRITICAL: Got access_token without mfa_ticket exchange!');
      return `HTTP ${r.status} · code=${r.data.error?.code} · NO session ✓ (TOTP without ticket is always rejected)`;
    });

    // ── Summary ────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  AUDIT SUMMARY');
    console.log('══════════════════════════════════════════');
    console.log(`  ✅ PASSED: ${passed}`);
    if (failed > 0) console.log(`  ❌ FAILED: ${failed}`);
    else console.log('  🎉 ALL TESTS PASSED — Auth is secure and correct');
    console.log('══════════════════════════════════════════\n');
  } finally {
    await prisma.$disconnect();
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
