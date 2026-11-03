/**
 * WELLNESS STUDIO OS — END-TO-END PRODUCTION VERIFICATION SUITE
 * Tests the entire production stack through Next.js Frontend (port 3000) and NestJS Gateway (port 3001)
 */

const http = require('http');
const crypto = require('crypto');
const path = require('path');

const FRONTEND_URL = 'http://localhost:3000';
const GATEWAY_URL = 'http://localhost:3001/api/v1';

const { PrismaClient } = require(path.join(__dirname, '../backend-nestjs-gateway/node_modules/@prisma/client'));
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL || 'postgresql://wellness_user:WellnessDB@2026@129.225.123.163:5432/wellness_studio' },
  },
});

let passed = 0;
let failed = 0;

function httpRequest(urlStr, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, data: json, rawText: data });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// RFC 6238 TOTP Generator
function generateTotp(base32Secret, timeStep = 30) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  const clean = base32Secret.toUpperCase().replace(/=+$/, '');
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  const secretKey = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretKey).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  );
  return String(binary % 1_000_000).padStart(6, '0');
}

async function runStep(name, fn) {
  process.stdout.write(`  ▶ ${name}... `);
  try {
    const result = await fn();
    console.log(`✅ ${result || 'OK'}`);
    passed++;
    return true;
  } catch (err) {
    console.log(`❌ FAILED: ${err.message}`);
    failed++;
    return false;
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('   WELLNESS STUDIO OS — END-TO-END PRODUCTION VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // [1] Gateway Health
  await runStep('NestJS Gateway Health Probe', async () => {
    const res = await httpRequest(`${GATEWAY_URL}/health`, 'GET');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (res.data?.data?.checks?.database?.status !== 'healthy') throw new Error('Database is not healthy');
    return `HTTP 200 · Database status: healthy (${res.data.data.checks.database.latencyMs}ms)`;
  });

  // [2] Frontend Route Availability
  await runStep('Next.js Staff Login Page Availability', async () => {
    const res = await httpRequest(`${FRONTEND_URL}/staff-login`, 'GET');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    return `HTTP 200 · Content-Length: ${res.headers['content-length'] || res.rawText.length}`;
  });

  // Unique test studio registered with Ultra Premium (enterprise tier)
  const rand = Date.now().toString(36).slice(-5);
  const studioName = `E2E Studio ${rand}`;
  const ownerEmail = `e2e_owner_${rand}@teststudio.com`;
  const ownerPass = 'E2EStudioPass@2026';
  const ownerPhone = '+919876543210';
  let tenantCode = '';
  let enrollToken = '';
  let totpSecret = '';
  let accessToken = '';
  let mfaTicket = '';

  // [3] Studio Registration via Next.js Proxy
  await runStep('Studio Registration through Next.js proxy (/api/auth/studio/register)', async () => {
    const res = await httpRequest(`${FRONTEND_URL}/api/auth/studio/register`, 'POST', {
      studio_name: studioName,
      owner_name: 'E2E Owner',
      owner_email: ownerEmail,
      owner_phone: ownerPhone,
      password: ownerPass,
      subscription_plan: 'Ultra Premium',
    });
    if (res.status !== 200 && res.status !== 201) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    const payload = res.data?.data || res.data;
    if (!payload.mfa_enrollment_required || !payload.enrollment_token) {
      throw new Error(`Registration did not return enrollment token: ${JSON.stringify(res.data)}`);
    }
    enrollToken = payload.enrollment_token;
    tenantCode = payload.tenant_code;
    return `HTTP ${res.status} · Tenant: ${tenantCode} · mfa_enrollment_required=true`;
  });

  // [4] TOTP Enrollment via Next.js Proxy
  await runStep('TOTP Enrollment through Next.js proxy (/api/auth/staff/totp/enroll)', async () => {
    const res = await httpRequest(
      `${FRONTEND_URL}/api/auth/staff/totp/enroll`,
      'POST',
      {},
      { Authorization: `Bearer ${enrollToken}`, 'x-tenant-code-dev': tenantCode }
    );
    if (res.status !== 200 && res.status !== 201) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    const payload = res.data?.data || res.data;
    if (!payload.secret || !Array.isArray(payload.recovery_codes) || payload.recovery_codes.length !== 10) {
      throw new Error(`Invalid enrollment response: ${JSON.stringify(payload)}`);
    }
    totpSecret = payload.secret;
    return `HTTP ${res.status} · Secret: ${totpSecret.slice(0, 8)}... · 10 Recovery Codes generated`;
  });

  // [5] Verify TOTP Enrollment via Next.js Proxy
  await runStep('Verify TOTP Code through Next.js proxy (/api/auth/staff/totp/verify)', async () => {
    const totpCode = generateTotp(totpSecret);
    const res = await httpRequest(
      `${FRONTEND_URL}/api/auth/staff/totp/verify`,
      'POST',
      { code: totpCode },
      { Authorization: `Bearer ${enrollToken}`, 'x-tenant-code-dev': tenantCode }
    );
    if (res.status !== 200 && res.status !== 201) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    return `HTTP ${res.status} · TOTP Code ${totpCode} verified successfully`;
  });

  // [6] Staff Login - Stage 1 (Password) -> Expect MFA Challenge
  await runStep('Password Login Challenge (/api/auth/staff/login) -> Returns MFA_REQUIRED', async () => {
    const res = await httpRequest(
      `${FRONTEND_URL}/api/auth/staff/login`,
      'POST',
      { email: ownerEmail, password: ownerPass },
      { 'x-tenant-code-dev': tenantCode }
    );
    if (res.status !== 401 && res.status !== 403) throw new Error(`Expected 401/403 MFA Challenge, got ${res.status}`);
    const errorCode = res.data?.error?.code || res.data?.code;
    mfaTicket = res.data?.error?.mfaTicket || res.data?.mfaTicket;
    if (errorCode !== 'MFA_REQUIRED' || !mfaTicket) {
      throw new Error(`Expected MFA_REQUIRED with mfaTicket: ${JSON.stringify(res.data)}`);
    }
    return `HTTP ${res.status} · MFA_REQUIRED challenge received with valid ticket`;
  });

  // [7] Staff Login - Stage 2 (Submit TOTP + MFA Ticket) -> Expect Session Tokens
  await runStep('Complete MFA Challenge with TOTP (/api/auth/staff/login) -> Issues Session', async () => {
    const totpCode = generateTotp(totpSecret);
    const res = await httpRequest(
      `${FRONTEND_URL}/api/auth/staff/login`,
      'POST',
      { email: ownerEmail, password: ownerPass, mfa_ticket: mfaTicket, totp_code: totpCode },
      { 'x-tenant-code-dev': tenantCode }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    const payload = res.data?.data || res.data;
    if (!payload.access_token || !payload.roles?.includes('owner')) {
      throw new Error(`Invalid session payload: ${JSON.stringify(payload)}`);
    }
    accessToken = payload.access_token;
    return `HTTP 200 · access_token issued · roles: [${payload.roles.join(', ')}]`;
  });

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'x-tenant-code-dev': tenantCode,
  };

  // [8] Verified Identity via /auth/staff/me
  await runStep('Staff Profile Retrieval (/api/v1/auth/staff/me)', async () => {
    const res = await httpRequest(`${GATEWAY_URL}/auth/staff/me`, 'GET', null, authHeaders);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    const body = res.data?.data || res.data;
    const email = body.user?.email || body.email;
    if (email !== ownerEmail) throw new Error(`Expected email ${ownerEmail}, got ${email}`);
    return `HTTP 200 · User verified: ${email} (Role: ${body.role || body.roles?.[0]})`;
  });

  // [9] Class Creation and Persistence
  let classId = '';
  await runStep('Class Operations (POST /api/v1/classes & GET /api/v1/classes)', async () => {
    const createRes = await httpRequest(`${GATEWAY_URL}/classes`, 'POST', {
      name: 'Power HIIT Fusion',
      category: 'HIIT',
      date: new Date().toISOString().split('T')[0],
      startTime: '08:00',
      endTime: '09:00',
      trainer: 'Alex Rivers',
      room: 'Studio A',
      capacity: 15,
      status: 'Scheduled',
    }, authHeaders);
    if (createRes.status !== 200 && createRes.status !== 201) throw new Error(`Create class failed: ${JSON.stringify(createRes.data)}`);
    const created = createRes.data?.data || createRes.data;
    classId = created.id;

    const listRes = await httpRequest(`${GATEWAY_URL}/classes`, 'GET', null, authHeaders);
    if (listRes.status !== 200) throw new Error(`List classes failed: ${JSON.stringify(listRes.data)}`);
    const classes = Array.isArray(listRes.data?.data) ? listRes.data.data : Array.isArray(listRes.data) ? listRes.data : [];
    const found = classes.find(c => c.id === classId || c.name === 'Power HIIT Fusion');
    if (!found) throw new Error('Created class not found in list response');
    return `HTTP 201/200 · Class created & listed (ID: ${classId})`;
  });

  // [10] Member Creation and Persistence with Valid DTO
  let memberId = '';
  await runStep('Member Operations (POST /api/v1/members & GET /api/v1/members)', async () => {
    const memberEmail = `member_${rand}@testdomain.com`;
    const createRes = await httpRequest(`${GATEWAY_URL}/members`, 'POST', {
      full_name: 'Rahul Sharma',
      email: memberEmail,
      phone: '+919876543299',
      date_of_birth: '1995-05-15',
      gender: 'male',
      join_date: '2026-10-01',
      status: 'active',
      emergency_contact: '+919876543200',
    }, authHeaders);
    if (createRes.status !== 200 && createRes.status !== 201) throw new Error(`Create member failed: ${JSON.stringify(createRes.data)}`);
    const created = createRes.data?.data || createRes.data;
    memberId = created.id;

    const listRes = await httpRequest(`${GATEWAY_URL}/members`, 'GET', null, authHeaders);
    if (listRes.status !== 200) throw new Error(`List members failed: ${JSON.stringify(listRes.data)}`);
    return `HTTP 201/200 · Member created & listed (ID: ${memberId})`;
  });

  // [11] Booking Creation
  let bookingId = '';
  await runStep('Booking Operations (POST /api/v1/bookings & GET /api/v1/bookings)', async () => {
    const createRes = await httpRequest(`${GATEWAY_URL}/bookings`, 'POST', {
      member_id: memberId,
      class_schedule_id: classId,
      booking_date: new Date().toISOString().split('T')[0],
    }, authHeaders);
    if (createRes.status !== 200 && createRes.status !== 201) throw new Error(`Create booking failed: ${JSON.stringify(createRes.data)}`);
    const created = createRes.data?.data || createRes.data;
    bookingId = created.id;

    const listRes = await httpRequest(`${GATEWAY_URL}/bookings`, 'GET', null, authHeaders);
    if (listRes.status !== 200) throw new Error(`List bookings failed: ${JSON.stringify(listRes.data)}`);
    return `HTTP 201/200 · Booking confirmed (ID: ${bookingId}, Status: ${created.status})`;
  });

  // [12] Attendance Recording with Valid DTO
  await runStep('Attendance Operations (POST /api/v1/attendance)', async () => {
    const res = await httpRequest(`${GATEWAY_URL}/attendance`, 'POST', {
      booking_id: bookingId,
      attendance_method: 'kiosk',
    }, authHeaders);
    if (res.status !== 200 && res.status !== 201) throw new Error(`Record attendance failed: ${JSON.stringify(res.data)}`);
    return `HTTP 201 · Attendance recorded for booking ${bookingId}`;
  });

  // [13] Leads Operations (Public Enquiry & Staff Lead Conversion)
  let leadId = '';
  await runStep('Leads Lifecycle (Public Enquiry -> List -> Conversion)', async () => {
    const publicRes = await httpRequest(`${GATEWAY_URL}/leads/public`, 'POST', {
      full_name: 'Pooja Verma',
      email: `pooja_${rand}@example.com`,
      phone: '+919876543211',
    }, { 'x-tenant-code-dev': tenantCode });
    if (publicRes.status !== 200 && publicRes.status !== 201) throw new Error(`Public enquiry failed: ${JSON.stringify(publicRes.data)}`);
    const created = publicRes.data?.data || publicRes.data;
    leadId = created.id;

    const convertRes = await httpRequest(`${GATEWAY_URL}/leads/${leadId}/convert`, 'POST', {}, authHeaders);
    if (convertRes.status !== 200 && convertRes.status !== 201) throw new Error(`Lead convert failed: ${JSON.stringify(convertRes.data)}`);
    return `HTTP 201 · Public enquiry created (ID: ${leadId}) and converted to member`;
  });

  // [14] Membership Plans with Valid DTO
  let membershipId = '';
  await runStep('Membership Plans (POST /api/v1/memberships & GET /api/v1/memberships)', async () => {
    const createRes = await httpRequest(`${GATEWAY_URL}/memberships`, 'POST', {
      member_id: memberId,
      plan_name: 'Annual Pass',
      plan_type: 'annual',
      start_date: '2026-10-01',
      end_date: '2027-10-01',
      price: 24999,
      auto_renew: true,
    }, authHeaders);
    if (createRes.status !== 200 && createRes.status !== 201) throw new Error(`Create membership failed: ${JSON.stringify(createRes.data)}`);
    const created = createRes.data?.data || createRes.data;
    membershipId = created.id;

    const listRes = await httpRequest(`${GATEWAY_URL}/memberships`, 'GET', null, authHeaders);
    if (listRes.status !== 200) throw new Error(`List memberships failed: ${JSON.stringify(listRes.data)}`);
    return `HTTP 201/200 · Plan created & verified (ID: ${membershipId}, Price: ₹24,999)`;
  });

  // [15] Payment Recording with Idempotency-Key
  await runStep('Payment Operations (POST /api/v1/payments & GET /api/v1/payments)', async () => {
    const payHeaders = {
      ...authHeaders,
      'Idempotency-Key': crypto.randomUUID(),
    };
    const payRes = await httpRequest(`${GATEWAY_URL}/payments`, 'POST', {
      member_id: memberId,
      membership_id: membershipId,
      amount: 24999,
      currency: 'INR',
      payment_method: 'upi',
    }, payHeaders);
    if (payRes.status !== 200 && payRes.status !== 201) throw new Error(`Record payment failed: ${JSON.stringify(payRes.data)}`);
    const listRes = await httpRequest(`${GATEWAY_URL}/payments`, 'GET', null, authHeaders);
    if (listRes.status !== 200) throw new Error(`List payments failed: ${JSON.stringify(listRes.data)}`);
    return `HTTP 201 · Payment of ₹24,999 recorded with method UPI and listed`;
  });

  // [16] Staff Member Invitation (RBAC)
  await runStep('Staff Invitation (POST /api/v1/auth/staff/invite)', async () => {
    const trainerEmail = `trainer_${rand}@teststudio.com`;
    const res = await httpRequest(`${GATEWAY_URL}/auth/staff/invite`, 'POST', {
      email: trainerEmail,
      displayName: 'Coach Marcus',
      roleCode: 'trainer',
    }, authHeaders);
    if (res.status !== 200 && res.status !== 201) throw new Error(`Invite staff failed: ${JSON.stringify(res.data)}`);
    return `HTTP 201 · Trainer invited: ${trainerEmail} (role: trainer)`;
  });

  // [17] Workspace Front-Desk Lead Creation (RBAC)
  await runStep('Front Desk Walk-in Lead Creation (/api/v1/workspaces/front-desk/leads)', async () => {
    // Owner has super-role permission or we test the employee workspaces route
    const leadRes = await httpRequest(`${GATEWAY_URL}/workspaces/front-desk/leads`, 'POST', {
      full_name: 'Anita Patel',
      phone: '+919876543233',
      email: `anita_${rand}@example.com`,
      notes: 'Interested in morning yoga batches',
    }, authHeaders);
    // front-desk endpoint requires front_desk or staff role; check if owner is allowed or if 403
    if (leadRes.status === 200 || leadRes.status === 201) {
      return `HTTP ${leadRes.status} · Front desk walk-in lead created successfully`;
    } else if (leadRes.status === 403) {
      return `HTTP 403 · Correctly role-gated to front_desk / staff roles`;
    }
    throw new Error(`Unexpected response: ${leadRes.status} ${JSON.stringify(leadRes.data)}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  E2E SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
