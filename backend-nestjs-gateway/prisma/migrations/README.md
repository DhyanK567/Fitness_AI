# Day 1 PostgreSQL foundation

These SQL migrations implement the Day 1 SL-owned application-database foundation from the Database Design Document:

1. Bootstrap schemas, tenant context, timestamps, and the RLS helper.
2. Platform tenant/studio/branch records.
3. IAM users, roles, permissions, credentials, sessions, and OTP challenges.
4. Tenant configuration and notification-rule metadata.
5. Transactional outbox, idempotency keys, and webhook inbox.
6. Append-only audit and security-event records.
7. Payment webhook claim/retry states (`processing` and `ignored`).

Run them in numeric order with a PostgreSQL migration user. Before every tenant-scoped transaction, the API must set `app.tenant_id` locally:

```sql
BEGIN;
SELECT set_config('app.tenant_id', '<tenant UUID>', true);
-- tenant-scoped work
COMMIT;
```

The NestJS gateway resolves the host's tenant code to the active `platform.tenants.id`, then `PrismaService.withTenant()` sets that UUID using transaction-local `set_config` before tenant-owned queries. Never pass a host slug into a UUID database column or an RLS context.

The migration user must not be an application runtime role. The application runtime role must not own the tables and must not have `BYPASSRLS`.
