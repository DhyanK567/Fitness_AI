# Import/Export Implementation Progress

## STEP 1 - REGRESSION CHECK (DONE)
- Ran 4 previously-failing gateway specs with TEST_DATABASE_URL set
- Result: ai-tool-registry, ai-audit, ai-07-admin-assistant all PASS with TEST_DATABASE_URL
- rls.integration.spec.ts fails identically at previous commit (git stash verified) — pre-existing DB permission issue (`User fitness_ai was denied access on database fitness_ai_test.public`), NOT a regression
- Full gateway suite with TEST_DATABASE_URL: 59 suites (59 pass, 1 pre-existing fail), 581 tests (557 pass, 24 pre-existing DB failures)
- No regressions from my changes. Target 57 suites/557+ tests met (557 tests passing).

## STEP 2 - MANUAL CREATES REMOVE LOCAL FALLBACK (DONE)
Files changed:
- frontend-nextjs/src/app/admin/_components/AdminWorkspacePages.tsx
  - saveMember: removed local-state fallback; on API failure shows real error toast, no row added
  - saveLead: async, uses ApiClient.createLead/updateLead; on failure shows real error toast, no row added
  - convertLeadToMember: async, uses ApiClient.createMember; on failure shows error toast, returns without converting
  - saveManualPayment: async, uses ApiClient.createPayment; on failure shows form error, no row added
- frontend-nextjs/src/lib/api-client/index.ts: added updateLead, createPayment, imported LeadPayload type
Frontend: 74/74 tests pass, typecheck clean, next build successful (61 routes).

## STEP 3 - IMPORT_STORE=erp|postgres SWITCH (DONE - core)
Files changed:
- backend-nestjs-gateway/prisma/schema.prisma — added StudioMember, StudioLead, StudioClass, StudioMembership, StudioBooking, StudioAttendance, StudioPayment, StudioEvent models in ops schema
- backend-nestjs-gateway/prisma/migrations/130_studio_domain_models/migration.sql — creates studio_* tables with RLS (tenant_id = platform.current_tenant()) + updated_at triggers
- backend-nestjs-gateway/src/import-export/import-export.service.ts — added isPostgresStore() helper; importRecords() branches to Prisma writes when IMPORT_STORE=postgres; createPostgres callbacks for all 8 types; fetchDatasetPostgres() for export
- backend-nestjs-gateway/src/modules/members/members.service.ts — list() reads from Prisma when IMPORT_STORE=postgres
- backend-nestjs-gateway/src/modules/leads/leads.service.ts — list() reads from Prisma when IMPORT_STORE=postgres
- backend-nestjs-gateway/src/modules/classes/classes.service.ts — list() reads from Prisma when IMPORT_STORE=postgres
Backend typecheck: clean.
Still needed: gateway tests with TEST_DATABASE_URL, seed script run against postgres (Step 4 - blocked without running DB).

## STEP 4 - RUN SEED SCRIPT (PENDING)
- Run scripts/import-data-folder.ts against IMPORT_STORE=postgres
- Paste select count(*) per table (expect 20/15/15 for members/leads/classes)
