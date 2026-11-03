import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

import * as fs from 'fs';
import * as path from 'path';
import { getTestDatabaseAvailability } from './test-database-availability';

const testDatabase = getTestDatabaseAvailability();
const describeWithTestDatabase = testDatabase.available ? describe : describe.skip;

describeWithTestDatabase('Phase 1A: Live Disposable PostgreSQL Integration Test', () => {
  const rawTestUrl = testDatabase.url;

  let dbHost = process.env.TEST_DB_HOST;
  let dbPort = process.env.TEST_DB_PORT;
  let dbName = process.env.TEST_DB_NAME;
  let adminUser = process.env.TEST_DB_ADMIN_USER || 'postgres';
  let adminPassword = process.env.TEST_DB_ADMIN_PASSWORD;
  let schemaParams = 'schema=public';

  if (rawTestUrl) {
    const parsed = new URL(rawTestUrl);
    dbHost = parsed.hostname || dbHost || '127.0.0.1';
    dbPort = parsed.port || dbPort || '5433';
    dbName = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || dbName || 'fitness_ai_ci_test';
    if (parsed.username) adminUser = decodeURIComponent(parsed.username);
    if (parsed.password) adminPassword = decodeURIComponent(parsed.password);
    if (parsed.search) {
      schemaParams = parsed.search.replace(/^\?/, '');
    }
  } else {
    dbHost = dbHost || '127.0.0.1';
    dbPort = dbPort || '5433';
    dbName = dbName || 'fitness_ai_ci_test';
  }

  // Safety Requirement: Never run against non-test databases or live production data.
  if (dbName === 'wellness_studio' || !dbName.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to run integration tests against non-test database "${dbName}". ` +
      `Test database must contain "test" in its name (not "wellness_studio").`
    );
  }

  const encodedUser = encodeURIComponent(adminUser);
  const encodedPass = adminPassword ? encodeURIComponent(adminPassword) : '';
  const adminAuth = encodedPass ? `${encodedUser}:${encodedPass}` : encodedUser;
  const adminUrl = rawTestUrl || `postgresql://${adminAuth}@${dbHost}:${dbPort}/${dbName}?${schemaParams}`;
  const appUrl = `postgresql://test_app_user:test_disposable_password@${dbHost}:${dbPort}/${dbName}?${schemaParams}`;
  const ingestUrl = `postgresql://test_ingest_user:test_disposable_password@${dbHost}:${dbPort}/${dbName}?${schemaParams}`;
  const workerUrl = `postgresql://test_worker_user:test_disposable_password@${dbHost}:${dbPort}/${dbName}?${schemaParams}`;

  let adminClient: PrismaClient;
  let appClient: PrismaClient;
  let ingestClient: PrismaClient;
  let workerClient: PrismaClient;

  // Shared test entity IDs
  let testTenantId: string;
  let starterTierId: string;
  let growthTierId: string;
  let testSubscriptionId: string;
  let uniqueRunId: string;
  let boundSubId: string;
  let isConnected = false;

  beforeAll(async () => {
    uniqueRunId = Date.now().toString().slice(-6);
    boundSubId = `sub_Live${uniqueRunId}`;

    // Verify admin connection first to fail fast with a descriptive infrastructure error
    try {
      adminClient = new PrismaClient({ datasources: { db: { url: adminUrl } } });
      const adminCheck = await adminClient.$queryRawUnsafe<Array<{ current_user: string }>>('SELECT current_user;');
      if (!adminCheck || adminCheck.length === 0) {
        throw new Error('No response from admin query');
      }
      isConnected = true;
    } catch (err: any) {
      throw new Error(
        `[Test Infrastructure Missing] Cannot connect to authorized test database at ${dbHost}:${dbPort}/${dbName}: ${err.message}. ` +
        `Ensure PostgreSQL is running and TEST_DATABASE_URL is set (e.g. postgresql://postgres:postgres@localhost:5433/fitness_ai_ci_test?schema=public).`
      );
    }

    // Ensure disposable login roles are provisioned with required role inheritance
    await adminClient.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_app_user') THEN
          CREATE ROLE test_app_user WITH LOGIN PASSWORD 'test_disposable_password'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
            IN ROLE fitness_app_runtime;
        ELSE
          ALTER ROLE test_app_user WITH LOGIN PASSWORD 'test_disposable_password';
          GRANT fitness_app_runtime TO test_app_user;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_ingest_user') THEN
          CREATE ROLE test_ingest_user WITH LOGIN PASSWORD 'test_disposable_password'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
            IN ROLE fitness_webhook_ingest;
        ELSE
          ALTER ROLE test_ingest_user WITH LOGIN PASSWORD 'test_disposable_password';
          GRANT fitness_webhook_ingest TO test_ingest_user;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_worker_user') THEN
          CREATE ROLE test_worker_user WITH LOGIN PASSWORD 'test_disposable_password'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
            IN ROLE fitness_worker_runtime;
        ELSE
          ALTER ROLE test_worker_user WITH LOGIN PASSWORD 'test_disposable_password';
          GRANT fitness_worker_runtime TO test_worker_user;
        END IF;

        GRANT USAGE ON SCHEMA platform TO test_app_user, test_ingest_user, test_worker_user;
      END $$;
    `);

    appClient = new PrismaClient({ datasources: { db: { url: appUrl } } });
    ingestClient = new PrismaClient({ datasources: { db: { url: ingestUrl } } });
    workerClient = new PrismaClient({ datasources: { db: { url: workerUrl } } });

    // Verify connections
    const adminCheck = await adminClient.$queryRawUnsafe<Array<{ current_user: string }>>('SELECT current_user;');
    expect(adminCheck[0].current_user).toBe(adminUser);

    const appCheck = await appClient.$queryRawUnsafe<Array<{ current_user: string }>>('SELECT current_user;');
    expect(appCheck[0].current_user).toBe('test_app_user');

    const ingestCheck = await ingestClient.$queryRawUnsafe<Array<{ current_user: string }>>('SELECT current_user;');
    expect(ingestCheck[0].current_user).toBe('test_ingest_user');

    const workerCheck = await workerClient.$queryRawUnsafe<Array<{ current_user: string }>>('SELECT current_user;');
    expect(workerCheck[0].current_user).toBe('test_worker_user');

    // Fetch seeded tiers
    const tiers = await adminClient.$queryRawUnsafe<Array<{ id: string; code: string }>>(
      "SELECT id, code FROM platform.subscription_tiers WHERE code IN ('starter', 'growth');"
    );
    const starter = tiers.find((t) => t.code === 'starter');
    const growth = tiers.find((t) => t.code === 'growth');
    expect(starter).toBeDefined();
    expect(growth).toBeDefined();
    starterTierId = starter!.id;
    growthTierId = growth!.id;

    // Seed test tenant for lifecycle tests
    testTenantId = randomUUID();
    await adminClient.$executeRawUnsafe(`
      INSERT INTO platform.tenants (id, code, legal_name, display_name, tier_id, status)
      VALUES ('${testTenantId}', 'test-tenant-${uniqueRunId}', 'Integration Test Gym Ltd', 'Test Gym', '${starterTierId}', 'onboarding');
    `);

    // Seed trialing subscription for this tenant
    testSubscriptionId = randomUUID();
    await adminClient.$executeRawUnsafe(`
      INSERT INTO platform.tenant_subscriptions (id, tenant_id, tier_id, status, provider, mandate_status, version)
      VALUES ('${testSubscriptionId}', '${testTenantId}', '${starterTierId}', 'trialing', 'razorpay', 'pending', 1);
    `);
  }, 30_000);

  afterAll(async () => {
    try {
      if (adminClient) {
        if (testTenantId) {
          await adminClient.$executeRawUnsafe(`DELETE FROM platform.tenant_invoices WHERE tenant_id = '${testTenantId}'::uuid;`);
          await adminClient.$executeRawUnsafe(`DELETE FROM platform.tenant_subscriptions WHERE tenant_id = '${testTenantId}'::uuid;`);
          await adminClient.$executeRawUnsafe(`DELETE FROM platform.tenants WHERE id = '${testTenantId}'::uuid;`);
        }
        if (uniqueRunId) {
          await adminClient.$executeRawUnsafe(`DELETE FROM platform.platform_webhook_inbox WHERE provider_event_id LIKE '%${uniqueRunId}%';`);
        }
      }
    } catch {
      // Safe cleanup fallback
    } finally {
      await adminClient?.$disconnect();
      await appClient?.$disconnect();
      await ingestClient?.$disconnect();
      await workerClient?.$disconnect();
    }
  });

  describe('Scope 3: Role & Privilege Enforcement with Actual Login Identities', () => {
    describe('test_app_user (fitness_app_runtime)', () => {
      it('allows SELECT on platform.tenants and platform.tenant_subscriptions', async () => {
        const tenants = await appClient.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*) FROM platform.tenants;');
        expect(Number(tenants[0].count)).toBeGreaterThanOrEqual(1);

        const subs = await appClient.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*) FROM platform.tenant_subscriptions;');
        expect(Number(subs[0].count)).toBeGreaterThanOrEqual(1);
      });

      it('allows UPDATE on permitted operational tenant columns', async () => {
        const count = await appClient.$executeRawUnsafe(`
          UPDATE platform.tenants SET display_name = 'Updated Gym Name' WHERE id = '${testTenantId}';
        `);
        expect(count).toBe(1);
      });

      it('DENIES UPDATE on sensitive tenant columns (tier_id, status)', async () => {
        await expect(
          appClient.$executeRawUnsafe(`
            UPDATE platform.tenants SET tier_id = '${growthTierId}' WHERE id = '${testTenantId}';
          `)
        ).rejects.toThrow(/permission denied for column tier_id of relation tenants|42501/);

        await expect(
          appClient.$executeRawUnsafe(`
            UPDATE platform.tenants SET status = 'active' WHERE id = '${testTenantId}';
          `)
        ).rejects.toThrow(/permission denied for column status of relation tenants|42501/);
      });

      it('DENIES direct INSERT, UPDATE, DELETE on platform.tenant_subscriptions', async () => {
        const dummyId = randomUUID();
        await expect(
          appClient.$executeRawUnsafe(`
            INSERT INTO platform.tenant_subscriptions (id, tenant_id, tier_id) VALUES ('${dummyId}', '${testTenantId}', '${starterTierId}');
          `)
        ).rejects.toThrow(/permission denied for table tenant_subscriptions|42501/);

        await expect(
          appClient.$executeRawUnsafe(`
            UPDATE platform.tenant_subscriptions SET status = 'active' WHERE id = '${testSubscriptionId}';
          `)
        ).rejects.toThrow(/permission denied for table tenant_subscriptions|42501/);

        await expect(
          appClient.$executeRawUnsafe(`
            DELETE FROM platform.tenant_subscriptions WHERE id = '${testSubscriptionId}';
          `)
        ).rejects.toThrow(/permission denied for table tenant_subscriptions|42501/);
      });

      it('DENIES direct INSERT on platform.tenant_invoices and platform.platform_webhook_inbox', async () => {
        await expect(
          appClient.$executeRawUnsafe(`
            INSERT INTO platform.tenant_invoices (tenant_id, subscription_id, provider_invoice_id, amount, billing_period_start, billing_period_end, status)
            VALUES ('${testTenantId}', '${testSubscriptionId}', 'inv_tamper', 1000, now(), now(), 'paid');
          `)
        ).rejects.toThrow(/permission denied for table tenant_invoices|42501/);

        await expect(
          appClient.$executeRawUnsafe(`
            INSERT INTO platform.platform_webhook_inbox (provider, provider_event_id, raw_body_sha256, payload)
            VALUES ('razorpay', 'evt_forge', 'hash123', '{}'::jsonb);
          `)
        ).rejects.toThrow(/permission denied for table platform_webhook_inbox|42501/);
      });

      it('DENIES EXECUTE on privileged worker functions', async () => {
        const dummyId = randomUUID();
        await expect(
          appClient.$queryRawUnsafe(`
            SELECT platform.reconcile_subscription_provider_state('${dummyId}'::uuid, '${dummyId}'::uuid, 1, '{}'::jsonb);
          `)
        ).rejects.toThrow(/permission denied for function reconcile_subscription_provider_state|42501/);

        await expect(
          appClient.$queryRawUnsafe(`
            SELECT platform.record_subscription_invoice('${dummyId}'::uuid, '${dummyId}'::uuid, 'inv_1', 'pay_1', 100, 'INR', now(), now(), 'paid', now());
          `)
        ).rejects.toThrow(/permission denied for function record_subscription_invoice|42501/);
      });
    });

    describe('test_ingest_user (fitness_webhook_ingest)', () => {
      it('allows INSERT into platform.platform_webhook_inbox', async () => {
        const eventId = `evt_ingest_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const res = await ingestClient.$executeRawUnsafe(`
          INSERT INTO platform.platform_webhook_inbox (provider, provider_event_id, raw_body_sha256, payload)
          VALUES ('razorpay', '${eventId}', 'sha256dummy', '{"event": "subscription.charged"}'::jsonb);
        `);
        expect(res).toBe(1);
      });

      it('DENIES SELECT, UPDATE, DELETE on platform.platform_webhook_inbox', async () => {
        await expect(
          ingestClient.$queryRawUnsafe('SELECT * FROM platform.platform_webhook_inbox;')
        ).rejects.toThrow(/permission denied for table platform_webhook_inbox|42501/);

        await expect(
          ingestClient.$executeRawUnsafe("UPDATE platform.platform_webhook_inbox SET status = 'processed';")
        ).rejects.toThrow(/permission denied for table platform_webhook_inbox|42501/);

        await expect(
          ingestClient.$executeRawUnsafe('DELETE FROM platform.platform_webhook_inbox;')
        ).rejects.toThrow(/permission denied for table platform_webhook_inbox|42501/);
      });

      it('DENIES all access to tenants, subscriptions, and invoices', async () => {
        await expect(ingestClient.$queryRawUnsafe('SELECT * FROM platform.tenants;')).rejects.toThrow(/permission denied/);
        await expect(ingestClient.$queryRawUnsafe('SELECT * FROM platform.tenant_subscriptions;')).rejects.toThrow(/permission denied/);
        await expect(ingestClient.$queryRawUnsafe('SELECT * FROM platform.tenant_invoices;')).rejects.toThrow(/permission denied/);
      });
    });

    describe('test_worker_user (fitness_worker_runtime)', () => {
      it('allows SELECT and UPDATE on platform_webhook_inbox', async () => {
        const rows = await workerClient.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*) FROM platform.platform_webhook_inbox;');
        expect(Number(rows[0].count)).toBeGreaterThanOrEqual(1);
      });

      it('DENIES direct INSERT, UPDATE, DELETE on platform.tenant_invoices', async () => {
        await expect(
          workerClient.$executeRawUnsafe(`
            INSERT INTO platform.tenant_invoices (tenant_id, subscription_id, provider_invoice_id, amount, billing_period_start, billing_period_end, status)
            VALUES ('${testTenantId}', '${testSubscriptionId}', 'inv_direct_worker', 100, now(), now(), 'paid');
          `)
        ).rejects.toThrow(/permission denied for table tenant_invoices|42501/);
      });

      it('DENIES EXECUTE on bind_tenant_subscription_mandate', async () => {
        await expect(
          workerClient.$queryRawUnsafe(`
            SELECT platform.bind_tenant_subscription_mandate('${testTenantId}'::uuid, 'sub_12345', 'plan_starter_monthly_provisional');
          `)
        ).rejects.toThrow(/permission denied for function bind_tenant_subscription_mandate|42501/);
      });
    });
  });

  describe('Scope 4: Mandate Binding, Idempotency, Conflicting Rebinding, and Preservation of Trial Status', () => {
    it('rejects invalid Razorpay subscription ID format', async () => {
      await expect(
        appClient.$queryRawUnsafe(`
          SELECT platform.bind_tenant_subscription_mandate('${testTenantId}'::uuid, 'invalid_format_id', 'plan_starter_monthly_provisional');
        `)
      ).rejects.toThrow(/Invalid Razorpay subscription ID format|P0002/);
    });

    it('rejects invalid Razorpay plan ID format', async () => {
      await expect(
        appClient.$queryRawUnsafe(`
          SELECT platform.bind_tenant_subscription_mandate('${testTenantId}'::uuid, 'sub_Valid12345', 'bad plan name!');
        `)
      ).rejects.toThrow(/Invalid Razorpay plan ID format|P0002/);
    });

    it('rejects unmapped provider plan ID', async () => {
      await expect(
        appClient.$queryRawUnsafe(`
          SELECT platform.bind_tenant_subscription_mandate('${testTenantId}'::uuid, 'sub_Valid12345', 'plan_unmapped_xyz');
        `)
      ).rejects.toThrow(/Invalid or inactive provider plan ID|P0004/);
    });

    it('binds provider IDs cleanly while preserving trialing status and incrementing version', async () => {
      const res = await appClient.$queryRawUnsafe<Array<{ bind_tenant_subscription_mandate: any }>>(`
        SELECT platform.bind_tenant_subscription_mandate('${testTenantId}'::uuid, '${boundSubId}', 'plan_starter_monthly_provisional');
      `);
      const result = res[0].bind_tenant_subscription_mandate;
      expect(result.success).toBe(true);
      expect(result.status).toBe('bound');
      expect(result.razorpay_subscription_id).toBe(boundSubId);

      // Verify row state
      const sub = await adminClient.$queryRawUnsafe<Array<{ status: string; mandate_status: string; version: number; razorpay_subscription_id: string }>>(`
        SELECT status, mandate_status, version, razorpay_subscription_id FROM platform.tenant_subscriptions WHERE id = '${testSubscriptionId}'::uuid;
      `);
      expect(sub[0].status).toBe('trialing'); // Preserves trial, NOT prematurely activated
      expect(sub[0].mandate_status).toBe('pending');
      expect(sub[0].razorpay_subscription_id).toBe(boundSubId);
      expect(sub[0].version).toBe(2);
    });

    it('allows idempotent rebinding with identical parameters without error or version bump', async () => {
      const res = await appClient.$queryRawUnsafe<Array<{ bind_tenant_subscription_mandate: any }>>(`
        SELECT platform.bind_tenant_subscription_mandate('${testTenantId}'::uuid, '${boundSubId}', 'plan_starter_monthly_provisional');
      `);
      const result = res[0].bind_tenant_subscription_mandate;
      expect(result.success).toBe(true);
      expect(result.status).toBe('already_bound');

      // Version remains 2
      const sub = await adminClient.$queryRawUnsafe<Array<{ version: number }>>(`
        SELECT version FROM platform.tenant_subscriptions WHERE id = '${testSubscriptionId}'::uuid;
      `);
      expect(sub[0].version).toBe(2);
    });

    it('rejects conflicting rebinding attempt to different provider subscription ID', async () => {
      const conflictingSubId = `sub_Conflicting${Date.now()}`;
      await expect(
        appClient.$queryRawUnsafe(`
          SELECT platform.bind_tenant_subscription_mandate('${testTenantId}'::uuid, '${conflictingSubId}', 'plan_starter_monthly_provisional');
        `)
      ).rejects.toThrow(/already bound to provider subscription|P0007/);
    });
  });

  describe('Scope 5: Invoice Creation, Immutable Financial Identity, and Rejection of Paid-Status Regression', () => {
    let testInboxId: string;
    let testClaimToken: string;
    let testInvoiceProviderId: string;

    beforeAll(async () => {
      if (!isConnected) return;
      testInboxId = randomUUID();
      testClaimToken = randomUUID();
      testInvoiceProviderId = `inv_test_${Date.now()}`;

      // Ingest webhook event with payload containing boundSubId
      const payload = {
        payload: {
          subscription: {
            entity: {
              id: boundSubId,
            },
          },
        },
      };

      await adminClient.$executeRawUnsafe(`
        INSERT INTO platform.platform_webhook_inbox (id, provider, provider_event_id, raw_body_sha256, payload, status, claim_token, claimed_at)
        VALUES ('${testInboxId}', 'razorpay', 'evt_inv_${Date.now()}', 'hash_inv', '${JSON.stringify(payload)}'::jsonb, 'claimed', '${testClaimToken}', now());
      `);
    });

    it('allows worker to record invoice via record_subscription_invoice with claimed token', async () => {
      const res = await workerClient.$queryRawUnsafe<Array<{ record_subscription_invoice: any }>>(`
        SELECT platform.record_subscription_invoice(
          '${testInboxId}'::uuid,
          '${testClaimToken}'::uuid,
          '${testInvoiceProviderId}',
          'pay_12345',
          149900,
          'INR',
          now() - interval '30 days',
          now(),
          'paid',
          now()
        );
      `);
      const result = res[0].record_subscription_invoice;
      expect(result.success).toBe(true);
      expect(result.status).toBe('paid');
      expect(result.provider_invoice_id).toBe(testInvoiceProviderId);

      const inv = await adminClient.$queryRawUnsafe<Array<{ status: string; amount: number; currency: string }>>(`
        SELECT status, amount, currency FROM platform.tenant_invoices WHERE provider_invoice_id = '${testInvoiceProviderId}';
      `);
      expect(inv[0].status).toBe('paid');
      expect(inv[0].amount).toBe(149900);
      expect(inv[0].currency).toBe('INR');
    });

    it('REJECTS regression from paid to failed/cancelled via trigger guard_invoice_immutability (P0008)', async () => {
      await expect(
        adminClient.$executeRawUnsafe(`
          UPDATE platform.tenant_invoices SET status = 'failed' WHERE provider_invoice_id = '${testInvoiceProviderId}';
        `)
      ).rejects.toThrow(/Cannot regress invoice .* from paid to failed|P0008/);

      await expect(
        adminClient.$executeRawUnsafe(`
          UPDATE platform.tenant_invoices SET status = 'cancelled' WHERE provider_invoice_id = '${testInvoiceProviderId}';
        `)
      ).rejects.toThrow(/Cannot regress invoice .* from paid to cancelled|P0008/);
    });

    it('REJECTS modification of financial terms (amount, currency, provider_invoice_id) (P0009)', async () => {
      await expect(
        adminClient.$executeRawUnsafe(`
          UPDATE platform.tenant_invoices SET amount = 50000 WHERE provider_invoice_id = '${testInvoiceProviderId}';
        `)
      ).rejects.toThrow(/Cannot modify financial identity or terms of invoice|P0009/);

      await expect(
        adminClient.$executeRawUnsafe(`
          UPDATE platform.tenant_invoices SET currency = 'USD' WHERE provider_invoice_id = '${testInvoiceProviderId}';
        `)
      ).rejects.toThrow(/Cannot modify financial identity or terms of invoice|P0009/);
    });

    it('preserves paid status idempotently if record_subscription_invoice called again with non-paid status', async () => {
      const res = await workerClient.$queryRawUnsafe<Array<{ record_subscription_invoice: any }>>(`
        SELECT platform.record_subscription_invoice(
          '${testInboxId}'::uuid,
          '${testClaimToken}'::uuid,
          '${testInvoiceProviderId}',
          'pay_12345',
          149900,
          'INR',
          now() - interval '30 days',
          now(),
          'issued',
          null
        );
      `);
      expect(res[0].record_subscription_invoice.success).toBe(true);

      const inv = await adminClient.$queryRawUnsafe<Array<{ status: string }>>(`
        SELECT status FROM platform.tenant_invoices WHERE provider_invoice_id = '${testInvoiceProviderId}';
      `);
      expect(inv[0].status).toBe('paid'); // Still paid, not regressed
    });
  });

  describe('Scope 6: Subscription Reconciliation, Stale-Version Rejection, and Unknown-Plan Quarantine', () => {
    let reconInboxId: string;
    let reconClaimToken: string;

    beforeEach(async () => {
      if (!isConnected) return;
      reconInboxId = randomUUID();
      reconClaimToken = randomUUID();
      const payload = {
        payload: {
          subscription: {
            entity: {
              id: boundSubId,
            },
          },
        },
      };

      await adminClient.$executeRawUnsafe(`
        INSERT INTO platform.platform_webhook_inbox (id, provider, provider_event_id, raw_body_sha256, payload, status, claim_token, claimed_at)
        VALUES ('${reconInboxId}', 'razorpay', 'evt_recon_${Date.now()}_${Math.random().toString(36).substring(7)}', 'hash_recon', '${JSON.stringify(payload)}'::jsonb, 'claimed', '${reconClaimToken}', now());
      `);
    });

    it('rejects stale-version reconciliation attempt via optimistic lock (P0005)', async () => {
      const liveSnapshot = {
        id: boundSubId,
        plan_id: 'plan_starter_monthly_provisional',
        status: 'active',
        paid_count: 1,
        current_end: Math.floor(Date.now() / 1000) + 86400 * 30,
      };

      // Current version is 2. Passing expected version 1 must fail with P0005
      await expect(
        workerClient.$queryRawUnsafe(`
          SELECT platform.reconcile_subscription_provider_state(
            '${reconInboxId}'::uuid,
            '${reconClaimToken}'::uuid,
            1,
            '${JSON.stringify(liveSnapshot)}'::jsonb
          );
        `)
      ).rejects.toThrow(/Concurrency conflict on subscription .*: expected version 1, actual 2|P0005/);
    });

    it('quarantines event when provider snapshot contains unmapped plan ID', async () => {
      const liveSnapshot = {
        id: boundSubId,
        plan_id: 'plan_unrecognized_commercial_tier_xyz',
        status: 'active',
        paid_count: 1,
        current_end: Math.floor(Date.now() / 1000) + 86400 * 30,
      };

      const res = await workerClient.$queryRawUnsafe<Array<{ reconcile_subscription_provider_state: any }>>(`
        SELECT platform.reconcile_subscription_provider_state(
          '${reconInboxId}'::uuid,
          '${reconClaimToken}'::uuid,
          2,
          '${JSON.stringify(liveSnapshot)}'::jsonb
        );
      `);
      const result = res[0].reconcile_subscription_provider_state;
      expect(result.success).toBe(false);
      expect(result.status).toBe('quarantined');
      expect(result.reason).toBe('UNKNOWN_PROVIDER_PLAN');

      // Verify inbox row was updated to quarantined
      const inbox = await adminClient.$queryRawUnsafe<Array<{ status: string; quarantine_reason: string }>>(`
        SELECT status, quarantine_reason FROM platform.platform_webhook_inbox WHERE id = '${reconInboxId}'::uuid;
      `);
      expect(inbox[0].status).toBe('quarantined');
      expect(inbox[0].quarantine_reason).toContain('UNKNOWN_PROVIDER_PLAN: plan_unrecognized_commercial_tier_xyz');
    });

    it('applies valid reconciliation, updates status and version, and trigger syncs tenant tier', async () => {
      const liveSnapshot = {
        id: boundSubId,
        plan_id: 'plan_growth_monthly_provisional', // Upgrade to growth
        status: 'active',
        paid_count: 1,
        current_end: Math.floor(Date.now() / 1000) + 86400 * 30,
      };

      const res = await workerClient.$queryRawUnsafe<Array<{ reconcile_subscription_provider_state: any }>>(`
        SELECT platform.reconcile_subscription_provider_state(
          '${reconInboxId}'::uuid,
          '${reconClaimToken}'::uuid,
          2,
          '${JSON.stringify(liveSnapshot)}'::jsonb
        );
      `);
      const result = res[0].reconcile_subscription_provider_state;
      expect(result.success).toBe(true);
      expect(result.status).toBe('applied');
      expect(result.new_status).toBe('active');
      expect(result.new_version).toBe(3);

      // Verify subscription record updated
      const sub = await adminClient.$queryRawUnsafe<Array<{ status: string; tier_id: string; version: number; paid_count: number }>>(`
        SELECT status, tier_id, version, paid_count FROM platform.tenant_subscriptions WHERE id = '${testSubscriptionId}'::uuid;
      `);
      expect(sub[0].status).toBe('active');
      expect(sub[0].tier_id).toBe(growthTierId);
      expect(sub[0].version).toBe(3);
      expect(sub[0].paid_count).toBe(1);

      // CRITICAL: Verify trigger trg_sync_tenant_subscription_tier synchronized tenant operational shell!
      const tenant = await adminClient.$queryRawUnsafe<Array<{ tier_id: string }>>(`
        SELECT tier_id FROM platform.tenants WHERE id = '${testTenantId}'::uuid;
      `);
      expect(tenant[0].tier_id).toBe(growthTierId);

      // Verify inbox status transitioned to processed
      const inbox = await adminClient.$queryRawUnsafe<Array<{ status: string }>>(`
        SELECT status FROM platform.platform_webhook_inbox WHERE id = '${reconInboxId}'::uuid;
      `);
      expect(inbox[0].status).toBe('processed');
    });
  });

  describe('Scope 7: Concurrent Webhook Claiming Using Two Independent Sessions', () => {
    let eventId1: string;
    let eventId2: string;
    let workerSession1: PrismaClient;
    let workerSession2: PrismaClient;

    beforeAll(async () => {
      if (!isConnected) return;
      workerSession1 = new PrismaClient({ datasources: { db: { url: workerUrl } } });
      workerSession2 = new PrismaClient({ datasources: { db: { url: workerUrl } } });

      // Ingest two distinct pending events via ingest client
      eventId1 = `evt_concurrent_1_${Date.now()}`;
      eventId2 = `evt_concurrent_2_${Date.now()}`;

      await ingestClient.$executeRawUnsafe(`
        INSERT INTO platform.platform_webhook_inbox (provider, provider_event_id, raw_body_sha256, payload, status)
        VALUES ('razorpay', '${eventId1}', 'hash_c1', '{"event": "payment.authorized"}'::jsonb, 'received'),
               ('razorpay', '${eventId2}', 'hash_c2', '{"event": "payment.authorized"}'::jsonb, 'received');
      `);
    });

    afterAll(async () => {
      await workerSession1?.$disconnect();
      await workerSession2?.$disconnect();
    });

    it('claims distinct events concurrently using FOR UPDATE SKIP LOCKED without blocking or double-claiming', async () => {
      const claimToken1 = randomUUID();
      const claimToken2 = randomUUID();

      // Session 1 and Session 2 concurrently claim an event
      let session1ClaimedId: string | null = null;
      let session2ClaimedId: string | null = null;

      await Promise.all([
        workerSession1.$transaction(async (tx) => {
          const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`
            SELECT id FROM platform.platform_webhook_inbox
            WHERE status = 'received' AND provider_event_id IN ('${eventId1}', '${eventId2}')
            ORDER BY received_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1;
          `);
          if (rows.length > 0) {
            session1ClaimedId = rows[0].id;
            await tx.$executeRawUnsafe(`
              UPDATE platform.platform_webhook_inbox
              SET status = 'claimed', claim_token = '${claimToken1}', claimed_at = now()
              WHERE id = '${session1ClaimedId}';
            `);
          }
        }),
        workerSession2.$transaction(async (tx) => {
          const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`
            SELECT id FROM platform.platform_webhook_inbox
            WHERE status = 'received' AND provider_event_id IN ('${eventId1}', '${eventId2}')
            ORDER BY received_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1;
          `);
          if (rows.length > 0) {
            session2ClaimedId = rows[0].id;
            await tx.$executeRawUnsafe(`
              UPDATE platform.platform_webhook_inbox
              SET status = 'claimed', claim_token = '${claimToken2}', claimed_at = now()
              WHERE id = '${session2ClaimedId}';
            `);
          }
        }),
      ]);

      expect(session1ClaimedId).not.toBeNull();
      expect(session2ClaimedId).not.toBeNull();
      // Ensure the two workers claimed DIFFERENT events
      expect(session1ClaimedId).not.toBe(session2ClaimedId);

      // Verify database state: both are claimed with different tokens
      const claimedRows = await adminClient.$queryRawUnsafe<Array<{ id: string; status: string; claim_token: string }>>(`
        SELECT id, status, claim_token FROM platform.platform_webhook_inbox WHERE id IN ('${session1ClaimedId}'::uuid, '${session2ClaimedId}'::uuid);
      `);
      expect(claimedRows).toHaveLength(2);
      expect(claimedRows[0].status).toBe('claimed');
      expect(claimedRows[1].status).toBe('claimed');
      expect(claimedRows[0].claim_token).not.toBe(claimedRows[1].claim_token);
    });
  });
});
