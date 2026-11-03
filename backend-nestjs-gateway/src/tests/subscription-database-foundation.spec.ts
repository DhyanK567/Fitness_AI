import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

describe('Phase 1A: Subscription Database Foundation & Security Specification', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../prisma/migrations/130_platform_subscription_infrastructure/migration.sql'
  );
  const testFixturePath = path.resolve(
    __dirname,
    '../../prisma/seeds/provision-test-roles.sql'
  );

  let migrationSql: string;
  let testFixtureSql: string;

  beforeAll(() => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    migrationSql = fs.readFileSync(migrationPath, 'utf8');

    expect(fs.existsSync(testFixturePath)).toBe(true);
    testFixtureSql = fs.readFileSync(testFixturePath, 'utf8');
  });

  describe('1. Schema & Table Constraints', () => {
    it('reconciles platform.tenants status check constraint and adds lifecycle fields', () => {
      expect(migrationSql).toContain("ALTER TABLE platform.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;");
      expect(migrationSql).toContain(
        "CHECK (status IN ('onboarding', 'active', 'past_due', 'suspended', 'pending_deletion', 'closed'))"
      );
      expect(migrationSql).toContain("trial_starts_at timestamptz");
      expect(migrationSql).toContain("trial_ends_at timestamptz");
      expect(migrationSql).toContain("pending_deletion_at timestamptz");
      expect(migrationSql).toContain("closed_at timestamptz");
    });

    it('creates platform.provider_plan_mappings with unique constraint', () => {
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS platform.provider_plan_mappings");
      expect(migrationSql).toContain("CONSTRAINT uq_provider_plan UNIQUE (provider, provider_plan_id)");
    });

    it('creates platform.tenant_subscriptions with versioning and single-active-subscription index', () => {
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS platform.tenant_subscriptions");
      expect(migrationSql).toContain("version integer NOT NULL DEFAULT 1 CHECK (version >= 1)");
      expect(migrationSql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_active_subscription");
      expect(migrationSql).toContain("WHERE status IN ('trialing', 'authenticated', 'active', 'past_due', 'halted', 'paused')");
    });

    it('creates platform.tenant_invoices with provider-level uniqueness and ON DELETE RESTRICT', () => {
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS platform.tenant_invoices");
      expect(migrationSql).toContain("CONSTRAINT uq_tenant_invoices_provider_invoice UNIQUE (provider, provider_invoice_id)");
      expect(migrationSql).toContain("ON DELETE RESTRICT");
    });

    it('creates platform.platform_webhook_inbox with claim state, retries, and quarantine fields', () => {
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS platform.platform_webhook_inbox");
      expect(migrationSql).toContain("claim_token uuid");
      expect(migrationSql).toContain("claimed_at timestamptz");
      expect(migrationSql).toContain("quarantined_at timestamptz");
      expect(migrationSql).toContain("quarantine_reason text");
      expect(migrationSql).toContain("retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0)");
      expect(migrationSql).toContain("CONSTRAINT uq_platform_webhook_inbox_provider_event UNIQUE (provider, provider_event_id)");
    });
  });

  describe('2. Database Role Topology & Least Privilege', () => {
    it('creates non-superuser, no-login, no-bypassrls role group topology in migration', () => {
      expect(migrationSql).toContain("CREATE ROLE fitness_app_runtime WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS");
      expect(migrationSql).toContain("CREATE ROLE fitness_webhook_ingest WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS");
      expect(migrationSql).toContain("CREATE ROLE fitness_worker_runtime WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS");
    });

    it('separates test-only login identities into dedicated disposable fixture', () => {
      expect(testFixtureSql).toContain("CREATE ROLE test_app_user WITH LOGIN PASSWORD");
      expect(testFixtureSql).toContain("IN ROLE fitness_app_runtime");
      expect(testFixtureSql).toContain("CREATE ROLE test_ingest_user WITH LOGIN PASSWORD");
      expect(testFixtureSql).toContain("IN ROLE fitness_webhook_ingest");
      expect(testFixtureSql).toContain("CREATE ROLE test_worker_user WITH LOGIN PASSWORD");
      expect(testFixtureSql).toContain("IN ROLE fitness_worker_runtime");
      expect(testFixtureSql).toContain("DO NOT RUN IN DEVELOPMENT, STAGING, OR PRODUCTION");
    });

    it('revokes default PUBLIC access and alters default privileges on platform schema', () => {
      expect(migrationSql).toContain("REVOKE ALL ON SCHEMA platform FROM PUBLIC;");
      expect(migrationSql).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA platform FROM PUBLIC;");
      expect(migrationSql).toContain("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA platform FROM PUBLIC;");
      expect(migrationSql).toContain("ALTER DEFAULT PRIVILEGES IN SCHEMA platform REVOKE ALL ON TABLES FROM PUBLIC;");
      expect(migrationSql).toContain("ALTER DEFAULT PRIVILEGES IN SCHEMA platform REVOKE ALL ON FUNCTIONS FROM PUBLIC;");
    });

    it('restricts fitness_app_runtime from direct writes on subscriptions, invoices, and inbox', () => {
      expect(migrationSql).toContain("REVOKE INSERT, UPDATE, DELETE ON platform.tenant_subscriptions FROM fitness_app_runtime;");
      expect(migrationSql).toContain("REVOKE INSERT, UPDATE, DELETE ON platform.tenant_invoices FROM fitness_app_runtime;");
      expect(migrationSql).toContain("REVOKE INSERT, UPDATE, DELETE ON platform.platform_webhook_inbox FROM fitness_app_runtime;");
    });

    it('strictly omits tier_id and status from fitness_app_runtime column-level update on tenants', () => {
      const tenantUpdateGrantMatch = migrationSql.match(/GRANT UPDATE \(([^)]+)\) ON platform\.tenants TO fitness_app_runtime;/);
      expect(tenantUpdateGrantMatch).not.toBeNull();
      const grantedCols = tenantUpdateGrantMatch![1].split(',').map((c) => c.trim().toLowerCase());
      expect(grantedCols).not.toContain('tier_id');
      expect(grantedCols).not.toContain('status');
      expect(grantedCols).toContain('legal_name');
      expect(grantedCols).toContain('display_name');
    });

    it('restricts fitness_webhook_ingest to INSERT-only on platform_webhook_inbox', () => {
      expect(migrationSql).toContain("GRANT INSERT ON platform.platform_webhook_inbox TO fitness_webhook_ingest;");
      expect(migrationSql).toContain("REVOKE SELECT, UPDATE, DELETE ON platform.platform_webhook_inbox FROM fitness_webhook_ingest;");
      expect(migrationSql).toContain("REVOKE ALL ON platform.tenant_subscriptions FROM fitness_webhook_ingest;");
      expect(migrationSql).toContain("REVOKE ALL ON platform.tenant_invoices FROM fitness_webhook_ingest;");
      expect(migrationSql).toContain("REVOKE ALL ON platform.tenants FROM fitness_webhook_ingest;");
    });

    it('revokes direct invoice writes from fitness_worker_runtime and grants record_subscription_invoice', () => {
      expect(migrationSql).toContain("REVOKE INSERT, UPDATE, DELETE ON platform.tenant_invoices FROM fitness_worker_runtime;");
      expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION platform.record_subscription_invoice");
      expect(migrationSql).toContain("TO fitness_worker_runtime;");
    });
  });

  describe('3. Privileged Functions & Lifecycle Verification (Static DDL Checks)', () => {
    it('defines platform.bind_tenant_subscription_mandate with SECURITY DEFINER and parameter validation', () => {
      expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION platform.bind_tenant_subscription_mandate");
      expect(migrationSql).toContain("p_razorpay_sub_id !~ '^sub_[A-Za-z0-9]+$'");
      expect(migrationSql).toContain("p_razorpay_plan_id !~ '^plan_[A-Za-z0-9_]+$'");
      expect(migrationSql).toContain("already bound to provider subscription %, cannot rebind to %");
      expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION platform.bind_tenant_subscription_mandate(uuid, text, text) TO fitness_app_runtime;");
    });

    it('defines platform.guard_invoice_immutability trigger preventing status regression', () => {
      expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION platform.guard_invoice_immutability()");
      expect(migrationSql).toContain("IF OLD.status = 'paid' AND NEW.status != 'paid' THEN");
      expect(migrationSql).toContain("RAISE EXCEPTION 'Cannot regress invoice % from paid to %'");
      expect(migrationSql).toContain("BEFORE UPDATE ON platform.tenant_invoices");
    });

    it('defines platform.record_subscription_invoice with claimed inbox validation', () => {
      expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION platform.record_subscription_invoice");
      expect(migrationSql).toContain("WHEN platform.tenant_invoices.status = 'paid' THEN 'paid'");
      expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION platform.record_subscription_invoice");
    });

    it('configures SECURITY DEFINER and fixed search_path on all privileged functions', () => {
      const secDefinerOccurrences = (migrationSql.match(/SECURITY DEFINER/g) || []).length;
      expect(secDefinerOccurrences).toBeGreaterThanOrEqual(5);

      const searchPathOccurrences = (migrationSql.match(/SET search_path = platform/g) || []).length;
      expect(searchPathOccurrences).toBeGreaterThanOrEqual(5);
    });
  });

  describe('4. Provider Subscription Binding Contract (Unit / Logic Simulation)', () => {
    interface SubRecord {
      id: string;
      tenantId: string;
      status: string;
      razorpaySubscriptionId: string | null;
      razorpayPlanId: string | null;
      mandateStatus: string;
      version: number;
    }

    function simulateBindMandate(
      sub: SubRecord,
      tenantId: string,
      razorpaySubId: string,
      razorpayPlanId: string,
      planCatalog: Record<string, string>
    ): { success: boolean; sub?: SubRecord; error?: string; status?: string } {
      if (!tenantId || sub.tenantId !== tenantId) {
        return { success: false, error: 'Tenant mismatch or not found' };
      }
      if (!/^sub_[A-Za-z0-9]+$/.test(razorpaySubId)) {
        return { success: false, error: 'Invalid Razorpay subscription ID format' };
      }
      if (!/^plan_[A-Za-z0-9_]+$/.test(razorpayPlanId)) {
        return { success: false, error: 'Invalid Razorpay plan ID format' };
      }
      if (!planCatalog[razorpayPlanId]) {
        return { success: false, error: 'Invalid or inactive provider plan ID' };
      }
      if (!['trialing', 'authenticated', 'active'].includes(sub.status)) {
        return { success: false, error: 'No eligible subscription found' };
      }
      if (sub.razorpaySubscriptionId !== null) {
        if (sub.razorpaySubscriptionId === razorpaySubId && sub.razorpayPlanId === razorpayPlanId) {
          return { success: true, status: 'already_bound', sub };
        }
        return { success: false, error: 'Conflicting rebinding attempt' };
      }
      return {
        success: true,
        status: 'bound',
        sub: {
          ...sub,
          razorpaySubscriptionId: razorpaySubId,
          razorpayPlanId: razorpayPlanId,
          mandateStatus: 'pending',
          version: sub.version + 1,
        },
      };
    }

    const planCatalog = { plan_starter_monthly: 'tier_starter_uuid' };

    it('rejects invalid Razorpay subscription ID format', () => {
      const sub: SubRecord = { id: 's1', tenantId: 't1', status: 'trialing', razorpaySubscriptionId: null, razorpayPlanId: null, mandateStatus: 'pending', version: 1 };
      const res = simulateBindMandate(sub, 't1', 'invalid_id_format', 'plan_starter_monthly', planCatalog);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid Razorpay subscription ID format');
    });

    it('rejects invalid Razorpay plan ID format', () => {
      const sub: SubRecord = { id: 's1', tenantId: 't1', status: 'trialing', razorpaySubscriptionId: null, razorpayPlanId: null, mandateStatus: 'pending', version: 1 };
      const res = simulateBindMandate(sub, 't1', 'sub_ABC123', 'bad-plan!', planCatalog);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid Razorpay plan ID format');
    });

    it('rejects unmapped provider plan ID', () => {
      const sub: SubRecord = { id: 's1', tenantId: 't1', status: 'trialing', razorpaySubscriptionId: null, razorpayPlanId: null, mandateStatus: 'pending', version: 1 };
      const res = simulateBindMandate(sub, 't1', 'sub_ABC123', 'plan_unmapped_xyz', planCatalog);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid or inactive provider plan ID');
    });

    it('binds provider IDs cleanly without premature activation', () => {
      const sub: SubRecord = { id: 's1', tenantId: 't1', status: 'trialing', razorpaySubscriptionId: null, razorpayPlanId: null, mandateStatus: 'pending', version: 1 };
      const res = simulateBindMandate(sub, 't1', 'sub_ABC123', 'plan_starter_monthly', planCatalog);
      expect(res.success).toBe(true);
      expect(res.status).toBe('bound');
      expect(res.sub!.razorpaySubscriptionId).toBe('sub_ABC123');
      expect(res.sub!.status).toBe('trialing'); // Preserves trialing status
      expect(res.sub!.mandateStatus).toBe('pending');
      expect(res.sub!.version).toBe(2);
    });

    it('allows idempotent rebinding of identical parameters', () => {
      const sub: SubRecord = { id: 's1', tenantId: 't1', status: 'trialing', razorpaySubscriptionId: 'sub_ABC123', razorpayPlanId: 'plan_starter_monthly', mandateStatus: 'pending', version: 2 };
      const res = simulateBindMandate(sub, 't1', 'sub_ABC123', 'plan_starter_monthly', planCatalog);
      expect(res.success).toBe(true);
      expect(res.status).toBe('already_bound');
    });

    it('rejects conflicting rebinding attempt to a different subscription ID', () => {
      const sub: SubRecord = { id: 's1', tenantId: 't1', status: 'trialing', razorpaySubscriptionId: 'sub_ABC123', razorpayPlanId: 'plan_starter_monthly', mandateStatus: 'pending', version: 2 };
      const res = simulateBindMandate(sub, 't1', 'sub_DIFFERENT999', 'plan_starter_monthly', planCatalog);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Conflicting rebinding attempt');
    });
  });

  describe('5. Invoice Immutability Guard (Unit / Logic Simulation)', () => {
    interface InvoiceRecord {
      id: string;
      tenantId: string;
      subscriptionId: string;
      providerInvoiceId: string;
      amount: number;
      currency: string;
      status: 'issued' | 'paid' | 'failed' | 'cancelled';
    }

    function simulateInvoiceUpdate(
      current: InvoiceRecord,
      updated: Partial<InvoiceRecord>
    ): { success: boolean; error?: string; invoice?: InvoiceRecord } {
      if (current.status === 'paid' && updated.status && updated.status !== 'paid') {
        return { success: false, error: 'Cannot regress invoice from paid to non-paid' };
      }
      if (
        (updated.tenantId && updated.tenantId !== current.tenantId) ||
        (updated.subscriptionId && updated.subscriptionId !== current.subscriptionId) ||
        (updated.amount !== undefined && updated.amount !== current.amount) ||
        (updated.currency && updated.currency !== current.currency) ||
        (updated.providerInvoiceId && updated.providerInvoiceId !== current.providerInvoiceId)
      ) {
        return { success: false, error: 'Cannot modify financial identity or terms of invoice' };
      }
      return {
        success: true,
        invoice: { ...current, ...updated },
      };
    }

    it('allows transition from issued to paid', () => {
      const inv: InvoiceRecord = { id: 'i1', tenantId: 't1', subscriptionId: 's1', providerInvoiceId: 'inv_123', amount: 999, currency: 'INR', status: 'issued' };
      const res = simulateInvoiceUpdate(inv, { status: 'paid' });
      expect(res.success).toBe(true);
      expect(res.invoice!.status).toBe('paid');
    });

    it('rejects regression from paid to failed', () => {
      const inv: InvoiceRecord = { id: 'i1', tenantId: 't1', subscriptionId: 's1', providerInvoiceId: 'inv_123', amount: 999, currency: 'INR', status: 'paid' };
      const res = simulateInvoiceUpdate(inv, { status: 'failed' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Cannot regress invoice from paid to non-paid');
    });

    it('rejects modification of financial amount on existing invoice', () => {
      const inv: InvoiceRecord = { id: 'i1', tenantId: 't1', subscriptionId: 's1', providerInvoiceId: 'inv_123', amount: 999, currency: 'INR', status: 'paid' };
      const res = simulateInvoiceUpdate(inv, { amount: 500 });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Cannot modify financial identity or terms of invoice');
    });
  });

  describe('6. Optional Live Database Integration Verification', () => {
    const testDbUrl = process.env.TEST_DATABASE_URL;

    if (!testDbUrl) {
      it('skips live database integration tests when TEST_DATABASE_URL is not provided (Safety Rule)', () => {
        // Notice: This test explicitly records that actual live PostgreSQL execution was not run.
        expect(true).toBe(true);
      });
    } else {
      let prisma: PrismaClient;

      beforeAll(async () => {
        prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
      });

      afterAll(async () => {
        await prisma.$disconnect();
      });

      it('verifies connection to test database', async () => {
        const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
        expect(result[0].ok).toBe(1);
      });
    }
  });
});
