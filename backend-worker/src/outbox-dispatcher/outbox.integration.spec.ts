import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://wsos:wsos_local@127.0.0.1:5432/fitness_ai_ci_test?schema=public';

const parsedUrl = new URL(testDbUrl);
const dbName = parsedUrl.pathname.replace(/^\//, '');
const isSafeTestDb =
  dbName !== 'wellness_studio' && dbName.toLowerCase().includes('test');

const describeLive = isSafeTestDb ? describe : describe.skip;

describeLive('Worker Outbox Integration Tests (Live PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: testDbUrl,
      },
    },
  });

  const TENANT_A = 'a1111111-1111-1111-1111-111111111111';
  const TENANT_B = 'b2222222-2222-2222-2222-222222222222';
  const TIER_ID = 'c0000000-0000-0000-0000-000000000000';
  let isSuperuser = false;

  async function asTenant<T>(
    tenantId: string | null,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      if (isSuperuser) {
        await tx.$executeRawUnsafe('SET LOCAL ROLE test_app_user');
      }
      if (tenantId) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.current_tenant', ${tenantId}, true)`;
      } else {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', '', true), set_config('app.current_tenant', '', true)`;
      }
      return work(tx);
    });
  }

  beforeAll(async () => {
    await prisma.$connect();

    const roleRows = await prisma.$queryRaw<
      Array<{ rolsuper: boolean; rolbypassrls: boolean }>
    >`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = CURRENT_USER
    `;
    isSuperuser = Boolean(roleRows[0]?.rolsuper || roleRows[0]?.rolbypassrls);

    if (isSuperuser) {
      await prisma.$executeRawUnsafe(`
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
          GRANT USAGE ON SCHEMA platform, iam, config, ops, audit, ai TO test_app_user;
          GRANT ALL ON ALL TABLES IN SCHEMA ops TO test_app_user;
          GRANT ALL ON ALL SEQUENCES IN SCHEMA ops TO test_app_user;
          GRANT EXECUTE ON FUNCTION platform.current_tenant() TO test_app_user;
          GRANT test_app_user TO CURRENT_USER;
        END $$;
      `);
    }

    // Ensure baseline tenant rows exist
    await prisma.$executeRaw`
      INSERT INTO platform.subscription_tiers (id, code, display_name)
      VALUES (${TIER_ID}::uuid, 'test_tier', 'Test Tier')
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO platform.tenants (id, code, legal_name, display_name, tier_id)
      VALUES
        (${TENANT_A}::uuid, 'tenant-a-test', 'Tenant A Legal', 'Tenant A', ${TIER_ID}::uuid),
        (${TENANT_B}::uuid, 'tenant-b-test', 'Tenant B Legal', 'Tenant B', ${TIER_ID}::uuid)
      ON CONFLICT (id) DO NOTHING
    `;

    // Clean up any test outbox events from previous runs
    await prisma.outboxEvent.deleteMany({
      where: {
        tenantId: { in: [TENANT_A, TENANT_B] },
      },
    });
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({
      where: {
        tenantId: { in: [TENANT_A, TENANT_B] },
      },
    });
    await prisma.$disconnect();
  });

  it('1. Outbox persistence: persists an outbox event in ops.outbox_events with valid fields and defaults', async () => {
    const classId = randomUUID();
    const correlationId = randomUUID();
    const idempotencyKey = `floor-alert:${TENANT_A}:${classId}:SURGE_90`;

    const created = await asTenant(TENANT_A, async (tx) => {
      return tx.outboxEvent.create({
        data: {
          tenantId: TENANT_A,
          eventType: 'floor.capacity.alert',
          subjectType: 'studio_class',
          subjectRef: classId,
          correlationId,
          idempotencyKey,
          payload: {
            tenantId: TENANT_A,
            classId,
            occupancyPct: 92,
            message: 'Capacity Surge',
          },
        },
      });
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe('pending');
    expect(created.attempts).toBe(0);
    expect(created.idempotencyKey).toBe(idempotencyKey);
    expect(created.tenantId).toBe(TENANT_A);
  });

  it('2. Concurrent idempotency: competing transactions on same key produce exactly one winner and P2002 error', async () => {
    const classId = randomUUID();
    const correlationId = randomUUID();
    const idempotencyKey = `floor-alert:${TENANT_A}:${classId}:CONCURRENT_TEST`;

    const runInsert = () =>
      asTenant(TENANT_A, async (tx) => {
        return tx.outboxEvent.create({
          data: {
            tenantId: TENANT_A,
            eventType: 'floor.capacity.alert',
            subjectType: 'studio_class',
            subjectRef: classId,
            correlationId,
            idempotencyKey,
            payload: { test: 'concurrent' },
          },
        });
      });

    const results = await Promise.allSettled([runInsert(), runInsert()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error.code || error.message).toMatch(/P2002|Unique constraint/i);

    // Verify exactly one row in DB
    const matchingRows = await prisma.outboxEvent.findMany({
      where: {
        tenantId: TENANT_A,
        idempotencyKey,
      },
    });
    expect(matchingRows).toHaveLength(1);
  });

  it('3. Duplicate event handling: sequential duplicate insert fails with P2002, but different tenant with same key succeeds', async () => {
    const classId = randomUUID();
    const correlationId = randomUUID();
    const sharedKey = `floor-alert-shared-key:${classId}`;

    // Tenant A insert succeeds
    await asTenant(TENANT_A, async (tx) => {
      return tx.outboxEvent.create({
        data: {
          tenantId: TENANT_A,
          eventType: 'floor.capacity.alert',
          subjectType: 'studio_class',
          subjectRef: classId,
          correlationId,
          idempotencyKey: sharedKey,
          payload: { tenant: 'A' },
        },
      });
    });

    // Tenant A duplicate insert fails
    await expect(
      asTenant(TENANT_A, async (tx) => {
        return tx.outboxEvent.create({
          data: {
            tenantId: TENANT_A,
            eventType: 'floor.capacity.alert',
            subjectType: 'studio_class',
            subjectRef: classId,
            correlationId: randomUUID(),
            idempotencyKey: sharedKey,
            payload: { tenant: 'A-dup' },
          },
        });
      }),
    ).rejects.toThrow(/P2002|Unique constraint/i);

    // Tenant B with SAME idempotency key succeeds (tenant-scoped partial index)
    const tenantBEvent = await asTenant(TENANT_B, async (tx) => {
      return tx.outboxEvent.create({
        data: {
          tenantId: TENANT_B,
          eventType: 'floor.capacity.alert',
          subjectType: 'studio_class',
          subjectRef: classId,
          correlationId: randomUUID(),
          idempotencyKey: sharedKey,
          payload: { tenant: 'B' },
        },
      });
    });
    expect(tenantBEvent.id).toBeDefined();
    expect(tenantBEvent.tenantId).toBe(TENANT_B);
  });

  it('4. Tenant isolation: Tenant A cannot see Tenant B outbox events under PostgreSQL RLS and cannot spoof tenant_id', async () => {
    const classA = randomUUID();
    const classB = randomUUID();

    await asTenant(TENANT_A, async (tx) => {
      return tx.outboxEvent.create({
        data: {
          tenantId: TENANT_A,
          eventType: 'floor.capacity.alert',
          subjectType: 'studio_class',
          subjectRef: classA,
          correlationId: randomUUID(),
          idempotencyKey: `floor-alert:${TENANT_A}:${classA}`,
          payload: { secret: 'Tenant A Secret' },
        },
      });
    });

    await asTenant(TENANT_B, async (tx) => {
      return tx.outboxEvent.create({
        data: {
          tenantId: TENANT_B,
          eventType: 'floor.capacity.alert',
          subjectType: 'studio_class',
          subjectRef: classB,
          correlationId: randomUUID(),
          idempotencyKey: `floor-alert:${TENANT_B}:${classB}`,
          payload: { secret: 'Tenant B Secret' },
        },
      });
    });

    // Under Tenant A context, query returns ONLY Tenant A events
    const tenantAEvents = await asTenant(TENANT_A, async (tx) => {
      return tx.outboxEvent.findMany();
    });

    for (const evt of tenantAEvents) {
      expect(evt.tenantId).toBe(TENANT_A);
    }
    const leaked = tenantAEvents.some((e) => e.tenantId === TENANT_B);
    expect(leaked).toBe(false);

    // Tenant A attempting to insert claiming Tenant B is rejected by RLS WITH CHECK policy
    await expect(
      asTenant(TENANT_A, async (tx) => {
        return tx.outboxEvent.create({
          data: {
            tenantId: TENANT_B,
            eventType: 'floor.capacity.alert',
            subjectType: 'studio_class',
            subjectRef: randomUUID(),
            correlationId: randomUUID(),
            idempotencyKey: `spoof-key:${randomUUID()}`,
            payload: { spoof: true },
          },
        });
      }),
    ).rejects.toThrow();
  });
});
