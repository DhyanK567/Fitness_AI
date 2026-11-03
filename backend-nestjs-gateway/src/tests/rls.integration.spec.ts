import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient, Prisma } from '@prisma/client';

import * as fs from 'fs';
import * as path from 'path';
import { getTestDatabaseAvailability } from './test-database-availability';

const testDatabase = getTestDatabaseAvailability();
const describeWithTestDatabase = testDatabase.available ? describe : describe.skip;

describeWithTestDatabase('PostgreSQL Row Level Security (RLS) Integration Tests', () => {
  const testDbUrl = testDatabase.url;

  // Safety Requirement: Fail safely if pointing to wellness_studio or a non-test database.
  const parsedUrl = new URL(testDbUrl);
  const dbName = parsedUrl.pathname.replace(/^\//, '');
  if (dbName === 'wellness_studio' || !dbName.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to run integration tests against database "${dbName}". ` +
      `TEST_DATABASE_URL must point to a dedicated test database containing "test" in its name (not "wellness_studio").`
    );
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: testDbUrl,
      },
    },
  });

  const TENANT_A = 'a1111111-1111-1111-1111-111111111111';
  const TENANT_B = 'b2222222-2222-2222-2222-222222222222';
  const USER_A = 'a3333333-3333-3333-3333-333333333333';
  const USER_B = 'b4444444-4444-4444-4444-444444444444';

  let isSuperuser = false;

  let convAId: string;
  let convBId: string;
  let kbAId: string;
  let kbBId: string;
  let docAId: string;

  /**
   * Run a transaction scoped to a given tenant context.
   * If connecting as superuser, switches session role to a non-superuser role
   * so that PostgreSQL genuinely enforces RLS checks.
   */
  async function asTenant<T>(
    tenantId: string | null,
    work: (tx: Prisma.TransactionClient) => Promise<T>
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

  /**
   * Run a transaction setting ONLY the legacy app.current_tenant context
   * to test platform.current_tenant() fallback behavior in migration 110.
   */
  async function asLegacySettingOnly<T>(
    tenantId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      if (isSuperuser) {
        await tx.$executeRawUnsafe('SET LOCAL ROLE test_app_user');
      }
      await tx.$executeRaw`SELECT set_config('app.tenant_id', '', true), set_config('app.current_tenant', ${tenantId}, true)`;
      return work(tx);
    });
  }

  /**
   * Run a transaction calling the updated ai.set_tenant_context() function.
   */
  async function asLegacyHelper<T>(
    tenantId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      if (isSuperuser) {
        await tx.$executeRawUnsafe('SET LOCAL ROLE test_app_user');
      }
      await tx.$executeRaw`SELECT ai.set_tenant_context(${tenantId}::uuid)`;
      return work(tx);
    });
  }

  const TIER_ID = 'c0000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    await prisma.$connect();

    // Check if connecting role is superuser (superusers bypass RLS in Postgres)
    const roleRows = await prisma.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = CURRENT_USER
    `;
    isSuperuser = Boolean(roleRows[0]?.rolsuper || roleRows[0]?.rolbypassrls);

    if (isSuperuser) {
      // Create and grant a non-superuser role for genuine RLS enforcement
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
          GRANT ALL ON ALL TABLES IN SCHEMA ai, audit, config TO test_app_user;
          GRANT ALL ON ALL SEQUENCES IN SCHEMA ai, audit, config TO test_app_user;
          GRANT EXECUTE ON FUNCTION platform.current_tenant() TO test_app_user;
          GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ai TO test_app_user;
          GRANT test_app_user TO CURRENT_USER;
        END $$;
      `);
    }

    // Seed baseline platform tier and tenants to satisfy foreign key constraints (e.g. audit_logs)
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

    // Clean up any lingering test tenant data
    await cleanupTestData();

    // Seed Baseline Conversations for Tenant A and Tenant B
    const [cARow] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ai.conversations (tenant_id, user_id, title)
      VALUES (${TENANT_A}::uuid, ${USER_A}::uuid, 'Tenant A Baseline Conversation')
      RETURNING id::text
    `;
    convAId = cARow.id;

    const [cBRow] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ai.conversations (tenant_id, user_id, title)
      VALUES (${TENANT_B}::uuid, ${USER_B}::uuid, 'Tenant B Baseline Conversation')
      RETURNING id::text
    `;
    convBId = cBRow.id;

    // Seed Baseline Knowledge Bases for Tenant A and Tenant B
    const [kbARow] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ai.knowledge_bases (tenant_id, name)
      VALUES (${TENANT_A}::uuid, 'Tenant A Baseline Knowledge Base')
      RETURNING id::text
    `;
    kbAId = kbARow.id;

    const [kbBRow] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ai.knowledge_bases (tenant_id, name)
      VALUES (${TENANT_B}::uuid, 'Tenant B Baseline Knowledge Base')
      RETURNING id::text
    `;
    kbBId = kbBRow.id;

    // Seed Baseline Document for Tenant A
    const [docARow] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ai.knowledge_base_documents (
        tenant_id, knowledge_base_id, source_type, title, content, content_hash
      )
      VALUES (
        ${TENANT_A}::uuid, ${kbAId}::uuid, 'manual', 'Doc A', 'Initial Doc Content',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      )
      RETURNING id::text
    `;
    docAId = docARow.id;
  });

  afterAll(async () => {
    try {
      await cleanupTestData();
    } finally {
      await prisma.$disconnect();
    }
  });

  async function cleanupTestData() {
    await prisma.$executeRaw`DELETE FROM ai.rag_query_logs WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`;
    await prisma.$executeRaw`DELETE FROM ai.knowledge_base_ingestion_jobs WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`;
    await prisma.$executeRaw`DELETE FROM ai.knowledge_chunks WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`;
    await prisma.$executeRaw`DELETE FROM ai.knowledge_base_documents WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`;
    await prisma.$executeRaw`DELETE FROM ai.knowledge_bases WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`;
    await prisma.$executeRaw`DELETE FROM ai.messages WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`;
    await prisma.$executeRaw`DELETE FROM ai.conversations WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`;
    await prisma.$executeRaw`DELETE FROM ai.pending_actions WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`;
    await prisma.$executeRaw`DELETE FROM ai.lead_scores WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`;
    await prisma.$executeRaw`DELETE FROM config.faq_entries WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`;
  }

  describe('1. Tenant A vs Tenant B Isolation', () => {
    it('Tenant A sees only its own conversations', async () => {
      const rows = await asTenant(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string; title: string }>>`
          SELECT id::text, title FROM ai.conversations
        `;
      });

      expect(rows.length).toBeGreaterThanOrEqual(1);
      const rowIds = rows.map((r) => r.id);
      expect(rowIds).toContain(convAId);
      expect(rowIds).not.toContain(convBId);
    });

    it('Tenant B sees only its own conversations', async () => {
      const rows = await asTenant(TENANT_B, async (tx) => {
        return tx.$queryRaw<Array<{ id: string; title: string }>>`
          SELECT id::text, title FROM ai.conversations
        `;
      });

      expect(rows.length).toBeGreaterThanOrEqual(1);
      const rowIds = rows.map((r) => r.id);
      expect(rowIds).toContain(convBId);
      expect(rowIds).not.toContain(convAId);
    });

    it('Tenant A cannot update or delete Tenant B conversation', async () => {
      const updatedCount = await asTenant(TENANT_A, async (tx) => {
        return tx.$executeRaw`
          UPDATE ai.conversations
          SET title = 'Tampered by Tenant A'
          WHERE id = ${convBId}::uuid
        `;
      });
      expect(updatedCount).toBe(0);

      const deletedCount = await asTenant(TENANT_A, async (tx) => {
        return tx.$executeRaw`
          DELETE FROM ai.conversations
          WHERE id = ${convBId}::uuid
        `;
      });
      expect(deletedCount).toBe(0);
    });
  });

  describe('2. Fail-Closed Behavior on Missing Tenant Context', () => {
    it('Query with unset tenant context returns 0 rows', async () => {
      const rows = await asTenant(null, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text FROM ai.conversations
        `;
      });
      expect(rows.length).toBe(0);
    });

    it('Insert with unset tenant context is blocked by RLS WITH CHECK policy', async () => {
      await expect(
        asTenant(null, async (tx) => {
          await tx.$executeRaw`
            INSERT INTO ai.conversations (tenant_id, user_id, title)
            VALUES (${TENANT_A}::uuid, ${USER_A}::uuid, 'Unauthenticated Insert')
          `;
        })
      ).rejects.toThrow(/violates row-level security policy/i);
    });
  });

  describe('3. Legacy Context Compatibility (platform.current_tenant)', () => {
    it('ai.set_tenant_context() correctly sets context and grants Tenant A access', async () => {
      const rows = await asLegacyHelper(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text FROM ai.conversations
        `;
      });

      expect(rows.length).toBeGreaterThanOrEqual(1);
      const rowIds = rows.map((r) => r.id);
      expect(rowIds).toContain(convAId);
      expect(rowIds).not.toContain(convBId);
    });

    it('Setting only app.current_tenant (without app.tenant_id) resolves via platform.current_tenant fallback', async () => {
      const rows = await asLegacySettingOnly(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text FROM ai.conversations
        `;
      });

      expect(rows.length).toBeGreaterThanOrEqual(1);
      const rowIds = rows.map((r) => r.id);
      expect(rowIds).toContain(convAId);
      expect(rowIds).not.toContain(convBId);
    });

    it('evaluates platform.current_tenant() directly under test_app_user and reflects active tenant context', async () => {
      const currentTenantA = await asTenant(TENANT_A, async (tx) => {
        const rows = await tx.$queryRaw<Array<{ current_tenant: string | null }>>`
          SELECT platform.current_tenant()::text as current_tenant
        `;
        return rows[0]?.current_tenant;
      });
      expect(currentTenantA).toBe(TENANT_A);

      const unsetTenant = await asTenant(null, async (tx) => {
        const rows = await tx.$queryRaw<Array<{ current_tenant: string | null }>>`
          SELECT platform.current_tenant()::text as current_tenant
        `;
        return rows[0]?.current_tenant;
      });
      expect(unsetTenant).toBeNull();
    });
  });

  describe('4. Cross-Tenant Parent-Record Violations for ai.messages', () => {
    it('Permits Tenant A to insert message into Tenant A conversation', async () => {
      const result = await asTenant(TENANT_A, async (tx) => {
        return tx.$executeRaw`
          INSERT INTO ai.messages (tenant_id, conversation_id, role, content)
          VALUES (${TENANT_A}::uuid, ${convAId}::uuid, 'user', 'Legitimate Tenant A message')
        `;
      });
      expect(result).toBe(1);
    });

    it('Blocks Tenant A from inserting message into Tenant B conversation', async () => {
      await expect(
        asTenant(TENANT_A, async (tx) => {
          await tx.$executeRaw`
            INSERT INTO ai.messages (tenant_id, conversation_id, role, content)
            VALUES (${TENANT_A}::uuid, ${convBId}::uuid, 'user', 'Cross-tenant message injection attempt')
          `;
        })
      ).rejects.toThrow(/violates row-level security policy/i);
    });

    it('Blocks Tenant A from inserting message claiming Tenant B tenant_id even on own conversation', async () => {
      await expect(
        asTenant(TENANT_A, async (tx) => {
          await tx.$executeRaw`
            INSERT INTO ai.messages (tenant_id, conversation_id, role, content)
            VALUES (${TENANT_B}::uuid, ${convAId}::uuid, 'user', 'Mismatched tenant_id message')
          `;
        })
      ).rejects.toThrow(/violates row-level security policy/i);
    });

    it('Tenant B cannot read messages belonging to Tenant A conversation', async () => {
      const messages = await asTenant(TENANT_B, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text FROM ai.messages WHERE conversation_id = ${convAId}::uuid
        `;
      });
      expect(messages.length).toBe(0);
    });
  });

  describe('5. Cross-Tenant Parent-Record Violations for Knowledge Base Child Tables', () => {
    it('Blocks Tenant A from creating document referencing Tenant B knowledge base', async () => {
      await expect(
        asTenant(TENANT_A, async (tx) => {
          await tx.$executeRaw`
            INSERT INTO ai.knowledge_base_documents (
              tenant_id, knowledge_base_id, source_type, title, content, content_hash
            )
            VALUES (
              ${TENANT_A}::uuid, ${kbBId}::uuid, 'manual', 'Cross-KB Doc', 'Content',
              'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899'
            )
          `;
        })
      ).rejects.toThrow(/violates row-level security policy/i);
    });

    it('Permits Tenant A to create knowledge chunk referencing Tenant A knowledge base and document', async () => {
      const result = await asTenant(TENANT_A, async (tx) => {
        return tx.$executeRaw`
          INSERT INTO ai.knowledge_chunks (
            tenant_id, knowledge_base_id, document_id, chunk_index, content
          )
          VALUES (
            ${TENANT_A}::uuid, ${kbAId}::uuid, ${docAId}::uuid, 0, 'Valid Tenant A Chunk'
          )
        `;
      });
      expect(result).toBe(1);
    });

    it('Blocks Tenant A from creating knowledge chunk referencing Tenant B knowledge base', async () => {
      await expect(
        asTenant(TENANT_A, async (tx) => {
          await tx.$executeRaw`
            INSERT INTO ai.knowledge_chunks (
              tenant_id, knowledge_base_id, document_id, chunk_index, content
            )
            VALUES (
              ${TENANT_A}::uuid, ${kbBId}::uuid, ${docAId}::uuid, 1, 'Injected cross-KB chunk'
            )
          `;
        })
      ).rejects.toThrow(/violates row-level security policy/i);
    });

    it('Blocks Tenant A from creating ingestion job referencing Tenant B knowledge base', async () => {
      await expect(
        asTenant(TENANT_A, async (tx) => {
          await tx.$executeRaw`
            INSERT INTO ai.knowledge_base_ingestion_jobs (
              tenant_id, knowledge_base_id, document_id, job_type
            )
            VALUES (
              ${TENANT_A}::uuid, ${kbBId}::uuid, ${docAId}::uuid, 'ingest'
            )
          `;
        })
      ).rejects.toThrow(/violates row-level security policy/i);
    });

    it('Blocks Tenant A from creating RAG query log referencing Tenant B knowledge base', async () => {
      await expect(
        asTenant(TENANT_A, async (tx) => {
          await tx.$executeRaw`
            INSERT INTO ai.rag_query_logs (
              tenant_id, knowledge_base_id, user_id, query_text
            )
            VALUES (
              ${TENANT_A}::uuid, ${kbBId}::uuid, ${USER_A}::uuid, 'Cross-tenant query log'
            )
          `;
        })
      ).rejects.toThrow(/violates row-level security policy/i);
    });
  });

  describe('6. CRM & Pending Action Tables Isolation', () => {
    it('Permits Tenant A to create pending action and hides it from Tenant B', async () => {
      const [action] = await asTenant(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO ai.pending_actions (
            tenant_id, user_id, action_type, payload, proposed_by, expires_at
          )
          VALUES (
            ${TENANT_A}::uuid, ${USER_A}::uuid, 'upgrade_plan', '{"tier": "pro"}',
            ${USER_A}::uuid, now() + interval '1 hour'
          )
          RETURNING id::text
        `;
      });
      expect(action.id).toBeDefined();

      const bActions = await asTenant(TENANT_B, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text FROM ai.pending_actions WHERE id = ${action.id}::uuid
        `;
      });
      expect(bActions.length).toBe(0);
    });

    it('Permits Tenant A to create lead score and hides it from Tenant B', async () => {
      const leadId = '55555555-5555-5555-5555-555555555555';
      const [score] = await asTenant(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO ai.lead_scores (
            tenant_id, lead_id, score, score_breakdown, model_version
          )
          VALUES (
            ${TENANT_A}::uuid, ${leadId}::uuid, 92, '{"factors": ["visited_twice"]}', 'v1'
          )
          RETURNING id::text
        `;
      });
      expect(score.id).toBeDefined();

      const bScores = await asTenant(TENANT_B, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text FROM ai.lead_scores WHERE id = ${score.id}::uuid
        `;
      });
      expect(bScores.length).toBe(0);
    });
  });

  describe('7. Enquiry Assistant FAQ Knowledge Isolation & Full-Text Search (config.faq_entries)', () => {
    let faqAId: string;
    let faqBId: string;
    let draftAId: string;

    it('Permits Tenant A to create approved FAQ entry and hides it from Tenant B', async () => {
      const [faqA] = await asTenant(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string; search_tsv: string }>>`
          INSERT INTO config.faq_entries (
            tenant_id, question, answer, tags, status
          )
          VALUES (
            ${TENANT_A}::uuid,
            'What are your studio hours and class timings?',
            'Our studio is open Monday to Sunday from 6:00 AM to 10:00 PM for all group classes and personal training.',
            ARRAY['hours', 'timing', 'schedule'],
            'approved'
          )
          RETURNING id::text, search_tsv::text
        `;
      });
      expect(faqA.id).toBeDefined();
      expect(faqA.search_tsv).toBeDefined();
      faqAId = faqA.id;

      // Tenant A can see its own FAQ
      const aEntries = await asTenant(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text FROM config.faq_entries WHERE id = ${faqA.id}::uuid
        `;
      });
      expect(aEntries.length).toBe(1);
      expect(aEntries[0].id).toBe(faqA.id);

      // Tenant B queries config.faq_entries and sees 0 rows for Tenant A entry
      const bEntries = await asTenant(TENANT_B, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text FROM config.faq_entries WHERE id = ${faqA.id}::uuid
        `;
      });
      expect(bEntries.length).toBe(0);
    });

    it('Permits Tenant B to create its own FAQ entry and isolates it from Tenant A', async () => {
      const [faqB] = await asTenant(TENANT_B, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO config.faq_entries (
            tenant_id, question, answer, tags, status
          )
          VALUES (
            ${TENANT_B}::uuid,
            'Do you offer complimentary trial passes?',
            'Tenant B offers one free trial pass per new member upon registration.',
            ARRAY['trial', 'free'],
            'approved'
          )
          RETURNING id::text
        `;
      });
      expect(faqB.id).toBeDefined();
      faqBId = faqB.id;

      // Tenant A cannot read Tenant B FAQ entry
      const aEntries = await asTenant(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text FROM config.faq_entries WHERE id = ${faqB.id}::uuid
        `;
      });
      expect(aEntries.length).toBe(0);
    });

    it('Blocks Tenant A from creating FAQ entry with Tenant B tenant_id (RLS WITH CHECK)', async () => {
      await expect(
        asTenant(TENANT_A, async (tx) => {
          await tx.$executeRaw`
            INSERT INTO config.faq_entries (
              tenant_id, question, answer, tags, status
            )
            VALUES (
              ${TENANT_B}::uuid,
              'Malicious cross-tenant injection',
              'Attempting to insert into Tenant B namespace',
              ARRAY['exploit'],
              'approved'
            )
          `;
        })
      ).rejects.toThrow(/violates row-level security policy/i);
    });

    it('Blocks Tenant A from updating or modifying Tenant B FAQ entry', async () => {
      const updatedCount = await asTenant(TENANT_A, async (tx) => {
        return tx.$executeRaw`
          UPDATE config.faq_entries
          SET question = 'Tampered question'
          WHERE id = ${faqBId}::uuid
        `;
      });
      expect(updatedCount).toBe(0);
    });

    it('Enforces approved-only FAQ retrieval and excludes draft or archived entries', async () => {
      // Create a draft entry for Tenant A
      const [draft] = await asTenant(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO config.faq_entries (
            tenant_id, question, answer, tags, status
          )
          VALUES (
            ${TENANT_A}::uuid,
            'Draft unapproved question about locker policies',
            'Draft answer that is pending studio manager approval.',
            ARRAY['lockers', 'draft'],
            'draft'
          )
          RETURNING id::text
        `;
      });
      draftAId = draft.id;

      // Querying with status = 'approved' returns only approved rows
      const approvedOnly = await asTenant(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id::text, status FROM config.faq_entries
          WHERE tenant_id = ${TENANT_A}::uuid AND status = 'approved'
        `;
      });

      const approvedIds = approvedOnly.map((r) => r.id);
      expect(approvedIds).toContain(faqAId);
      expect(approvedIds).not.toContain(draftAId);
      for (const row of approvedOnly) {
        expect(row.status).toBe('approved');
      }
    });

    it('Verifies PostgreSQL generated tsvector search and ranking (ts_rank_cd)', async () => {
      const searchResults = await asTenant(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string; rank: number }>>`
          SELECT
            id::text,
            ts_rank_cd(search_tsv, plainto_tsquery('english', 'studio hours timings')) AS rank
          FROM config.faq_entries
          WHERE tenant_id = ${TENANT_A}::uuid
            AND status = 'approved'
            AND search_tsv @@ plainto_tsquery('english', 'studio hours timings')
          ORDER BY rank DESC
        `;
      });

      expect(searchResults.length).toBeGreaterThanOrEqual(1);
      expect(searchResults[0].id).toBe(faqAId);
      expect(searchResults[0].rank).toBeGreaterThan(0);

      // Unrelated search query returns 0 rows
      const emptyResults = await asTenant(TENANT_A, async (tx) => {
        return tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text FROM config.faq_entries
          WHERE tenant_id = ${TENANT_A}::uuid
            AND status = 'approved'
            AND search_tsv @@ plainto_tsquery('english', 'astronaut space shuttle orbiting mars')
        `;
      });
      expect(emptyResults.length).toBe(0);
    });
  });
});
