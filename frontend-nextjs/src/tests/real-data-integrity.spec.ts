/**
 * RD-01 — Real-Data Integrity & Mock Separation Test Suite
 * Wellness Studio OS — Verifying Production Real-Data Paths, Error Propagation,
 * Honest Empty States, and Tenant Host Propagation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, canonicalizeImportRows } from '../lib/api-client';
import { AiApi } from '../features/ai/api/ai-api';
import { resolveServerTenantHost, resolveClientTenantHost } from '../lib/tenant';
import { getDemoAccounts, authenticateStudioAccount } from '../lib/auth/demoAuth';
import fs from 'node:fs';
import path from 'node:path';

describe('RD-01: Real-Data Integrity Suite', () => {
  const originalFetch = global.fetch;
  const originalEnvUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalTenantHost = process.env.NEXT_PUBLIC_TENANT_HOST;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
    process.env.NEXT_PUBLIC_TENANT_HOST = 'demo.fitness.local';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_URL = originalEnvUrl;
    process.env.NEXT_PUBLIC_TENANT_HOST = originalTenantHost;
  });

  describe('1. API Client URL Normalization & Tenant Context', () => {
    it('normalizes base URL and always includes /api/v1 prefix', () => {
      assert.equal(ApiClient.getBaseUrl(), 'http://localhost:3001');
      assert.equal(ApiClient.getEndpoint('/classes'), 'http://localhost:3001/api/v1/classes');
      assert.equal(ApiClient.getEndpoint('classes/123'), 'http://localhost:3001/api/v1/classes/123');
      assert.equal(ApiClient.getEndpoint('/api/v1/custom'), 'http://localhost:3001/api/v1/custom');
    });

    it('injects browser-safe tenant context on all outbound API requests', async () => {
      let capturedHeaders: Record<string, string> = {};
      global.fetch = async (url: any, init: any) => {
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'cls_1', name: 'Vinyasa Flow' }],
        } as Response;
      };

      await ApiClient.getClasses();
      assert.equal(capturedHeaders['x-tenant-host'], 'demo.fitness.local');
      assert.equal(capturedHeaders['Content-Type'], 'application/json');
    });
  });

  describe('2. Public Enquiry CRM Contract & Fake Success Elimination', () => {
    it('calls /api/v1/leads/public with strictly whitelisted PublicEnquiryDto fields', async () => {
      let targetUrl = '';
      let targetMethod = '';
      let sentBody: any = null;

      global.fetch = async (url: any, init: any) => {
        targetUrl = String(url);
        targetMethod = init.method;
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'lead_uuid_101', status: 'new' }),
        } as Response;
      };

      const result = await ApiClient.createPublicEnquiry({
        full_name: 'Radhika Sharma',
        phone: '+919876543210',
        email: 'radhika@example.com',
      });

      assert.equal(targetUrl, 'http://localhost:3001/api/v1/leads/public');
      assert.equal(targetMethod, 'POST');
      assert.equal(sentBody.full_name, 'Radhika Sharma');
      assert.equal(sentBody.phone, '+919876543210');
      assert.equal(sentBody.email, 'radhika@example.com');
      // Prohibited fields must NOT be present
      assert.equal(sentBody.source, undefined);
      assert.equal(sentBody.notes, undefined);
      assert.equal(result.id, 'lead_uuid_101');
    });

    it('propagates API error and never reports success on network failure', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ message: ['phone must be a valid phone number'] }),
        } as Response;
      };

      await assert.rejects(
        async () =>
          ApiClient.createPublicEnquiry({
            full_name: 'Invalid Phone User',
            phone: 'abc',
          }),
        (err: Error) => {
          assert.ok(err.message.includes('valid phone number'));
          return true;
        },
      );
    });
  });

  describe('3. Booking Writes and Error Integrity', () => {
    it('sends real booking creation to /api/v1/bookings', async () => {
      let targetUrl = '';
      let sentBody: any = null;

      global.fetch = async (url: any, init: any) => {
        targetUrl = String(url);
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'bk_real_555',
            status: 'confirmed',
            booked_at: '2026-10-15T10:00:00Z',
          }),
        } as Response;
      };

      const booking = await ApiClient.createBooking({
        member_id: 'mem_real_1',
        class_schedule_id: 'sched_real_2',
        booking_date: '2026-10-16T07:30:00.000Z',
      });

      assert.equal(targetUrl, 'http://localhost:3001/api/v1/bookings');
      assert.equal(sentBody.class_schedule_id, 'sched_real_2');
      assert.equal(booking.id, 'bk_real_555');
      assert.equal(booking.status, 'confirmed');
    });

    it('throws real error when booking fails due to credit exhaustion or full capacity', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 409,
          statusText: 'Conflict',
          json: async () => ({ message: 'Member has no active credits remaining' }),
        } as Response;
      };

      await assert.rejects(
        async () =>
          ApiClient.createBooking({
            member_id: 'mem_real_1',
            class_schedule_id: 'sched_real_2',
            booking_date: '2026-10-16T07:30:00.000Z',
          }),
        (err: Error) => {
          assert.ok(err.message.includes('no active credits'));
          return true;
        },
      );
    });
  });

  describe('4. AI Audit Log Retrieval Contract', () => {
    it('calls GET /api/v1/ai/audit with correct query parameters and Host header', async () => {
      let targetUrl = '';
      let capturedHeaders: Record<string, string> = {};

      global.fetch = async (url: any, init: any) => {
        targetUrl = String(url);
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'audit_log_1',
              actor: 'usr_staff_1',
              tool: 'member_freeze',
              arguments_redacted: { member_id: 'mem_1' },
              decision: 'approved',
              approval: { approved_by: 'usr_staff_1' },
              result: 'succeeded',
              at: '2026-10-15T00:00:00Z',
            },
          ],
        } as Response;
      };

      const logs = await AiApi.getAuditLogs({ tool: 'member_freeze', limit: 10 });
      assert.equal(
        targetUrl,
        'http://localhost:3001/api/v1/ai/audit?tool=member_freeze&limit=10',
      );
      assert.equal(capturedHeaders['x-tenant-host'], 'demo.fitness.local');
      assert.equal(logs.length, 1);
      assert.equal(logs[0].tool, 'member_freeze');
      assert.equal(logs[0].decision, 'approved');
    });
  });

  describe('5. Auth Route Proxy & Prefix Integrity', () => {
    it('verifies all Next.js auth proxy route files include /api/v1 prefix and Host header', () => {
      const authRouteFiles = [
        'src/app/api/auth/staff/login/route.ts',
        'src/app/api/auth/staff/refresh/route.ts',
        'src/app/api/auth/staff/logout/route.ts',
        'src/app/api/auth/member/login-otp/route.ts',
        'src/app/api/auth/member/verify-otp/route.ts',
        'src/app/api/auth/member/refresh/route.ts',
        'src/app/api/auth/member/logout/route.ts',
      ];

      for (const relPath of authRouteFiles) {
        const fullPath = path.resolve(__dirname, '../../', relPath);
        assert.ok(fs.existsSync(fullPath), `Route file ${relPath} must exist`);
        const content = fs.readFileSync(fullPath, 'utf-8');
        assert.ok(
          content.includes('/api/v1/'),
          `Route ${relPath} must target backend with /api/v1 prefix`,
        );
        assert.ok(
          content.includes('API_TENANT_HOST') || content.includes('Host'),
          `Route ${relPath} must supply Host header for tenant resolution`,
        );
      }
    });

    it('verifies public enquiry page never sets submitted=true in a catch/finally fallback', () => {
      const enquiryPath = path.resolve(__dirname, '../../src/app/(public)/enquiry/page.tsx');
      const content = fs.readFileSync(enquiryPath, 'utf-8');

      // Make sure ApiClient.createPublicEnquiry is called
      assert.ok(
        content.includes('ApiClient.createPublicEnquiry'),
        'Enquiry page must invoke ApiClient.createPublicEnquiry',
      );

      // Verify that finally block only manages loading state and does NOT set submitted=true
      const finallyIndex = content.indexOf('finally {');
      assert.ok(finallyIndex !== -1, 'finally block must exist');
      const finallyBlock = content.slice(finallyIndex, content.indexOf('}', finallyIndex) + 1);
      assert.ok(
        !finallyBlock.includes('setSubmitted(true)'),
        'finally block must NOT unconditionally set submitted=true',
      );
      assert.ok(
        !finallyBlock.includes('addToast'),
        'finally block must NOT unconditionally show success toast',
      );
    });

    it('verifies MemberBookClassPage calls real ApiClient.getClasses and ApiClient.createBooking', () => {
      const bookClassPath = path.resolve(__dirname, '../../src/app/member/book-class/page.tsx');
      const content = fs.readFileSync(bookClassPath, 'utf-8');

      assert.ok(
        content.includes('ApiClient.getClasses()'),
        'MemberBookClassPage must load classes via ApiClient.getClasses()',
      );
      assert.ok(
        content.includes('ApiClient.createBooking('),
        'MemberBookClassPage must perform booking writes via ApiClient.createBooking()',
      );
      assert.ok(
        !content.includes('WS-BK-${Math.floor'),
        'MemberBookClassPage must NOT invent random client-side booking IDs',
      );
    });
  });

  describe('6. RD-02: Tenant Isolation & Production Lockdown', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalApiTenant = process.env.API_TENANT_HOST;
    const originalPublicTenant = process.env.NEXT_PUBLIC_TENANT_HOST;

    afterEach(() => {
      (process.env as any).NODE_ENV = originalNodeEnv;
      if (originalApiTenant !== undefined) {
        process.env.API_TENANT_HOST = originalApiTenant;
      } else {
        delete process.env.API_TENANT_HOST;
      }
      if (originalPublicTenant !== undefined) {
        process.env.NEXT_PUBLIC_TENANT_HOST = originalPublicTenant;
      } else {
        delete process.env.NEXT_PUBLIC_TENANT_HOST;
      }
    });

    it('resolveServerTenantHost returns null in production when unconfigured rather than falling back to demo', () => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.API_TENANT_HOST;

      const result = resolveServerTenantHost();
      assert.equal(result, null, 'Must never silently resolve to demo.fitness.local in production');
    });

    it('resolveServerTenantHost respects API_TENANT_HOST in production', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.API_TENANT_HOST = 'studio-omega.fitness.com';

      const result = resolveServerTenantHost();
      assert.equal(result, 'studio-omega.fitness.com');
    });

    it('resolveClientTenantHost returns null in production when unconfigured', () => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.NEXT_PUBLIC_TENANT_HOST;
      delete process.env.API_TENANT_HOST;

      const result = resolveClientTenantHost();
      assert.equal(result, null, 'Client tenant host must be null in production if unconfigured');
    });

    it('getDemoAccounts and authenticateStudioAccount reject in production', () => {
      (process.env as any).NODE_ENV = 'production';

      const accounts = getDemoAccounts();
      assert.deepEqual(accounts, [], 'Demo accounts must be empty in production');

      const authResult = authenticateStudioAccount('admin@fitnessstudio.demo', 'Admin@123');
      assert.ok(authResult.error, 'Authentication must return error in production');
      assert.ok(
        authResult.error?.includes('disabled in production'),
        'Error must state demo accounts are disabled in production',
      );
      assert.equal(authResult.session, undefined);
    });

    it('verifies all 7 Next.js auth proxy route files use resolveServerTenantHost', () => {
      const authRouteFiles = [
        'src/app/api/auth/staff/login/route.ts',
        'src/app/api/auth/staff/refresh/route.ts',
        'src/app/api/auth/staff/logout/route.ts',
        'src/app/api/auth/member/login-otp/route.ts',
        'src/app/api/auth/member/verify-otp/route.ts',
        'src/app/api/auth/member/refresh/route.ts',
        'src/app/api/auth/member/logout/route.ts',
      ];

      for (const relPath of authRouteFiles) {
        const fullPath = path.resolve(__dirname, '../../', relPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        assert.ok(
          content.includes('resolveServerTenantHost'),
          `Route ${relPath} must use resolveServerTenantHost`,
        );
      }
    });
  });

  describe('7. CSV Import Header Canonicalization', () => {
    it('maps plantype to planType', () => {
      const rows = [{ plantype: 'Half-Yearly', name: 'Test Plan' }];
      const result = canonicalizeImportRows(rows);
      assert.equal(result[0].planType, 'Half-Yearly');
      assert.equal(result[0].name, 'Test Plan');
    });

    it('maps PlanType to planType', () => {
      const rows = [{ PlanType: 'Annual', name: 'Test Plan' }];
      const result = canonicalizeImportRows(rows);
      assert.equal(result[0].planType, 'Annual');
      assert.equal(result[0].name, 'Test Plan');
    });

    it('maps plan_type to planType', () => {
      const rows = [{ plan_type: 'Quarterly', name: 'Test Plan' }];
      const result = canonicalizeImportRows(rows);
      assert.equal(result[0].planType, 'Quarterly');
      assert.equal(result[0].name, 'Test Plan');
    });

    it('passes through already-camelCased planType unchanged', () => {
      const rows = [{ planType: 'Monthly', name: 'Test Plan' }];
      const result = canonicalizeImportRows(rows);
      assert.equal(result[0].planType, 'Monthly');
    });
  });
});

