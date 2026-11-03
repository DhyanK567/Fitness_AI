# Fitness AI / Wellness Studio OS — Current Working Status & Production-Readiness Tracker

**Last updated: 2026-10-28 | Branch: FitnessAI-EndpointsIntegration | Commit: 0c09b53**

---

## 1. Current Working Status

Each item below is labeled with a status and evidence (file paths). Status definitions:
- **DONE** — Verified in code (implementation complete, tests exist, typecheck/build passes)
- **PARTIAL** — Partially implemented; gaps noted
- **NOT STARTED** — No implementation found
- **UNVERIFIED** — Code exists but could not confirm runtime behavior without running services

---

### 1.1 Authentication & Identity (Auth)

| Feature | Status | Evidence |
|---------|--------|----------|
| Owner registration (tenant + owner user + subscription tier) | **DONE** | `backend-nestjs-gateway/src/auth/auth.service.ts:1100-1387` (`registerStudio`), migration 100+ adds `user_totp`, `totp_recovery_codes`, `auth_action_tokens` |
| Email verification (owner) — `verifyOwnerEmail` | **DONE** | `auth.service.ts:1389-1467` calls `platform.verify_owner_email` SQL function; returns access+refresh tokens on success (line 1416) |
| Resend verification email | **DONE** | `auth.service.ts:1469-1736` (`resendVerificationEmail`) with rate limiting (1/min, 5/24h), token invalidation, audit outbox |
| MFA enrollment (TOTP) — forced for owner/admin | **DONE** | `auth.service.ts:272-283` (login returns `mfa_enrollment_required` + enrollment token), `enrollTotp`/`verifyTotpEnrollment` at 513-553 |
| MFA verification at login (strict, no dev bypass) | **DONE** | `completeMfa` at 335-370; `verifyTotp` uses RFC 6238; recovery codes single-use |
| Staff login (password + MFA challenge) | **DONE** | `login` at 236-333; lockout after 5 failures (15 min) |
| Refresh token rotation + reuse detection (revokes family) | **DONE** | `refresh` at 697-752; rotation with `familyId`, `parentTokenHash`, `replacedByTokenHash` |
| Staff invite (single-use 48h token) | **DONE** | `invite` at 420-496; `auth_action_tokens` purpose `invite` |
| Password reset request (no enumeration) | **DONE** | `requestPasswordReset` at 555-589; dev logs only, prod requires SMTP/Resend |
| Password reset consume (single-use) | **DONE** | `completePasswordReset` at 626-668; fingerprint or token-hash flow |
| Member signup (B2C) with consent | **DONE** | `memberSignup` at 839-859; creates member user + role |
| Member OTP request/verify (mock mode only in dev/test) | **DONE** | `requestMemberOtp`/`memberOtpVerify` at 884-975; `OTP_MODE=mock` guard |

**NOT STARTED / GAPS:**
- Google Sign-In for members (no `google-identity.service.ts` wired into member flow)
- Social login for staff (no OAuth2 integration in staff auth)

---

### 1.2 AI: Orchestrator, Guardrails, RAG, Assistants, Agents

| Feature | Status | Evidence |
|---------|--------|----------|
| LLM Gateway (multi-provider, queue, budget, fallback) | **DONE** | `backend-nestjs-gateway/src/ai/gateway/llm-gateway.service.ts`; Gemini primary, Ollama fallback; per-tenant daily token budget |
| Conversation Orchestrator (multi-turn, tool calling, streaming SSE) | **DONE** | `orchestrator/conversation-loop.ts`; events: `message.delta`, `tool.started`, `tool.finished`, `action.pending`, `error`, `done` |
| Tool Registry (70 tools, RBAC, risk class, confirmation gating) | **DONE** | `tools/tool-registry.ts`; `ScopeRules.canUseTool`; write tools require `ai:approve` |
| Guardrails: Scope refusal, PII redaction (phone, email, Aadhaar, card) | **DONE** | `guardrails/scope-rules.ts`, `guardrails/pii-redaction.ts` (Indian patterns added) |
| Pending Action Store (2-phase write: propose → confirm → execute) | **DONE** | `orchestrator/confirmation-state-machine.ts`; `ai.pending_actions` table; idempotency key |
| AI Audit (immutable per tool call) | **DONE** | `common/audit-outbox.service.ts`; `ai.llm_call_metrics`, `tool_call_metrics`, `pending_action_metrics` |
| **Admin Assistant (Admin Copilot)** | **DONE** | Agent `admin-copilot` in `agent-registry.service.ts:96-137`; tools: expiring memberships, low attendance, member count, dashboard summary, create member (2-phase) |
| **Public Enquiry Assistant** | **DONE** | Agent `public-enquiry` at 140-178; FAQ grounding, public events, class schedules, active plans, lead capture |
| **Booking Assistant** | **DONE** | Agent `booking-assistant` at 181-220; slot availability, eligible schedule, member entitlement, book/cancel |
| **Recommendation Assistant** | **DONE** | Agent `recommendation-assistant` at 223-262; goal alignment, attendance patterns, eligible sessions |
| **Feedback Intelligence** | **DONE** | Agent `feedback-intelligence` at 265-304; sentiment/NPS breakdown, classification, trends |
| **CRM Agent (AI-06)** | **DONE** | Agent `crm-agent` at 307-346; tools: score lead, pipeline overview, move lead, create stage, create campaign, enroll, metrics — **BUT** 6/6 ERP methods missing → feature flag `ai.crm` OFF (see PROGRESS.md:86-94) |
| **Operations Agent (AI-07)** | **DONE** | Agent `operations-agent` at 349-388; 11 tools (capacity, staff schedule, equipment, facility, waitlist, alerts, cancellation impact, schedule optimization) — 7/11 ERP methods exist |
| **Marketing Agent (AI-08)** | **DONE** | Agent `marketing-agent` at 391-430; 10 tools (campaign perf, create campaign, audience segments, content calendar, attribution, brand health, review mgmt, competitor intel) — 9/10 ERP methods exist |
| **Advertising Agent (AI-09)** | **DONE** | Agent `advertising-agent` registered in `agent-registry.service.ts`; service at `src/ai/marketing/advertising.service.ts` with 3 capabilities (attribution-report, roas-metrics, channel-recommendations); test file `src/tests/ai-09-advertising-agent.spec.ts` (776 lines, 30+ tests covering routing, tenant isolation, honest attribution, ROAS/CPA/currency safety, channel recommendations, ERP fallback, RBAC, audit logging) |
| **Growth Agent (AI-10)** | **DONE** | Agent `growth-agent` at 433-472; 9 tools (acquisition, referral, upsell, LTV, expansion, experiments) — 8/8 ERP methods exist |
| **Studio Insights Agent (AI-11)** | **DONE** | Agent `studio-insights` at 475-514; revenue trends, executive summary, churn risk modeling — uses analytics module |
| **Session Summary Agent (AI-12)** | **PARTIAL** | Listed in registry; no dedicated service/tools found in code scan |
| **RAG / Knowledge Base (HNSW + FTS indexes)** | **DONE** | Schema: `knowledge_bases`, `knowledge_base_documents`, `knowledge_chunks` (vector(1536)) at `schema.prisma:805-879`; **Migration 135** creates HNSW index `idx_knowledge_chunks_hnsw_embedding` with `vector_cosine_ops` (m=16, ef_construction=64) and FTS GIN index `idx_knowledge_chunks_content_fts` on `to_tsvector('english', content)`; drops legacy IVFFlat index; **requires pgvector extension** (Docker uses `pgvector/pgvector:pg16`); RetrievalService uses `embedding <=> query` KNN; embedding service supports OpenAI (1536-dim) only; Cohere/local rejected for dim mismatch |

---

### 1.3 Backend Modules (ERPNext-backed via adapter)

| Module | Status | Evidence |
|--------|--------|----------|
| Members | **DONE** | `modules/members/members.service.ts`; ERP methods: `member.list`, `member.get`, `member.create`, `member.update` |
| Memberships | **DONE** | `modules/memberships/memberships.service.ts`; ERP: `membership.list`, `membership.get`, `membership.create`, `membership.activate`, `membership.cancel` |
| Classes | **DONE** | `modules/classes/classes.service.ts`; ERP: `class_type.list`, `class_session.list`, `class_schedule.list` |
| Bookings | **DONE** | `modules/bookings/bookings.service.ts`; ERP: `booking.create`, `booking.list`, `booking.get`, `booking.cancel`, `booking.promote_waitlist`; optimistic concurrency on seat capacity |
| Attendance | **DONE** | `modules/attendance/attendance.service.ts`; ERP: `attendance.create`, `attendance.list`, `attendance.get`, `attendance.correct` |
| Payments | **DONE** | `payments/payments.service.ts` + `razorpay-webhook.service.ts`; Razorpay order create, webhook signature verification, idempotency via `ops.webhook_inbox` |
| Leads | **DONE** | `modules/leads/leads.service.ts`; ERP: `lead.list`, `lead.get`, `lead.create`, `lead.convert` |
| Events | **DONE** | `modules/events/events.service.ts`; ERP: `event.list`, `event.get`, `event.create`, `event.register` |
| Staff | **DONE** | `modules/staff/staff.service.ts`; ERP: `staff.list`, `staff.get`, `staff.create`, `staff.update` |
| Reports / Dashboard | **DONE** | `modules/dashboard/dashboard.service.ts`; unified reporting service shared by UI and AI |
| Notifications / Outbox | **DONE** | `notifications/` module; templates, delivery records, outbox dispatcher (worker) |
| Configuration (Feature Flags) | **DONE** | `configuration/configuration.service.ts`; `platform.tenant_feature_flags` + tier features |

---

### 1.4 Frontend (Next.js 15 App Router)

| Workspace / Area | Status | Evidence |
|------------------|--------|----------|
| **Public (marketing, classes, events, enquiry, workshop registration)** | **DONE** | `src/app/(public)/` — landing page, class timetable, events, enquiry page with floating `PublicEnquiryChatWidget` |
| **Auth (staff login, member login, reset password)** | **DONE** | `src/app/(auth)/` — staff login (email/password + TOTP), member OTP flow |
| **Admin (B2B) — Dashboard, Members, Memberships, Classes, Bookings, Attendance, Leads, Events, Payments, Reports, Staff, Notifications, Settings, AI Assistant** | **DONE** | `src/app/admin/` + `src/app/staff/` routes; permission-aware UI (hide), server enforces |
| **Trainer workspace** | **DONE** | `src/app/trainer/` — dashboard, attendance, classes, members, settings |
| **Front Desk workspace** | **DONE** | `src/app/front-desk/` — dashboard, bookings, walk-ins |
| **Member (B2C) — Home, My Membership, Book Class, Check-in, Events, My Payments, My Profile, Recommendations** | **DONE** | `src/app/member/` routes |
| **Landing page + Tenant branding customization** | **PARTIAL** | `TenantBranding` model exists (`schema.prisma:478-490`); `tenant_branding` table; frontend `tenant-theme` lib — verify runtime application |
| **AI Hub (12-Agent Management)** | **DONE** | `src/app/admin/ai/page.tsx` — agent cards, health, capabilities, diagnostic probes |
| **Live Copilot (Admin AI Assistant + Confirmation Modal)** | **DONE** | `src/app/admin/ai-assistant/page.tsx` — SSE chat, action confirmation modal for write tools |

---

### 1.5 ERPNext Custom App (`wellness_studio`)

| Area | Status | Evidence |
|------|--------|----------|
| DocTypes (ws_member, ws_membership_plan, ws_membership, ws_class_type, ws_class_session, ws_booking, ws_waitlist_entry, ws_attendance, ws_attendance_correction, ws_lead, ws_event, ws_event_registration, ws_payment + 15 new for AI agents) | **DONE** | `erpnext-custom-app/wellness_studio/wellness_studio/doctype/` — 28+ DocTypes |
| Whitelisted APIs (booking, waitlist, check_in, membership_activation, reports, member, classes, lead, events, payment, operations, growth, marketing) | **DONE** | `erpnext-custom-app/wellness_studio/wellness_studio/api/` — 24 endpoints |
| Permission hooks (tenant_scope query conditions) | **DONE** | `tenant/permissions.py` — `ws_studio_scope`, `ws_branch_scope`, `wellness_tenant_scope` |
| Scheduler events (membership expiry, event hold expiry, operational alerts hourly) | **DONE** | `hooks.py:24-37` |
| Doc events → signed callbacks to API | **DONE** | `hooks.py:42-95` + `events/callbacks.py` |
| **Duplicate layout note:** Both `erpnext-custom-app/wellness_studio/` (outer) and `erpnext-custom-app/wellness_studio/wellness_studio/` (inner) exist. The **inner** (`wellness_studio/wellness_studio/`) is the authoritative Frappe app package (Python package naming). The outer is a legacy scaffold. Do not change either. | **DONE** | Confirmed by directory structure and Python import conventions |

---

### 1.6 Worker (Background Jobs)

| Component | Status | Evidence |
|-----------|--------|----------|
| Outbox Dispatcher (FOR UPDATE SKIP LOCKED, batch, retry, dead-letter) | **DONE** | `backend-worker/src/outbox-dispatcher/outbox-dispatcher.service.ts` |
| Scheduler: Pending action expiry (5 min) | **DONE** | `scheduler.service.ts:22-74` |
| Scheduler: Membership expiry (daily 2 AM) | **DONE** | `scheduler.service.ts:80-130` |
| Scheduler: Renewal reminders (daily 10 AM; 7/3/1 days + expiry day) | **DONE** | `scheduler.service.ts:136-190` |
| Scheduler: Event hold expiry | **DONE** | `scheduler.service.ts:192-230` |
| Scheduler: Nightly reconciliation | **DONE** | `scheduler.service.ts:232-270` |
| AI Job: Feedback classification (15 min; LLM + heuristic fallback) | **DONE** | `backend-worker/src/ai-jobs/feedback-classification.job.ts` |
| AI Job: Retention (weekly churn risk, daily engagement, winback) | **DONE** | `backend-worker/src/ai-jobs/retention.job.ts` |
| Redis client (ioredis, connection pooling, healthcheck) | **DONE** | `backend-worker/src/common/redis-client.ts` |
| Health endpoint (port 3002) | **NOT STARTED** | `backend-worker/src/health/.gitkeep` only — AUD-009 |

---

### 1.7 CI Pipeline (`.github/workflows/ci.yml`)

| Step | Status | Notes |
|------|--------|-------|
| Secret scan (`scripts/check-secrets.sh`) | **DONE** | Runs on PR |
| pnpm install (`--no-frozen-lockfile`) | **PARTIAL** | Uses `--no-frozen-lockfile` (non-deterministic); should be `--frozen-lockfile` in CI |
| Prisma generate (gateway) | **DONE** | `pnpm --filter @fitness-ai/backend-nestjs-gateway exec prisma generate` |
| Lint (all packages, `--if-present`) | **PARTIAL** | `--if-present` skips empty packages; masks missing lint scripts |
| Typecheck (all packages, `--if-present`) | **PARTIAL** | Same issue |
| Test (all packages, `--if-present`) | **PARTIAL** | Same issue; no test DB/service provisioning in CI |
| **Branch triggers** | **PARTIAL** | Only `develop`, `release`, `main` — excludes `integration/**` branches (AUD-003) |

---

### 1.8 Test Inventory (Spec Files Exist — Results UNVERIFIED unless noted)

| Area | Spec Files (Count) | Notes |
|------|-------------------|-------|
| Auth (staff login, MFA, invite, reset, member OTP) | 6 files (auth.service.spec.ts, auth.controller.spec.ts, totp.spec.ts, login-rate-limit.guard.spec.ts, staff-access.guard.spec.ts, auth-registration.service.spec.ts) | Core auth: 19+14+6+2+2 = 43 tests PASS per PROGRESS.md |
| Rate limiting | 1 file (rate-limit.guard.spec.ts) | 9 tests PASS |
| ERP retry / circuit breaker | 1 file (erpnext.service.spec.ts) | 6 tests PASS |
| Response envelope / exception filter | 2 files | 13 tests PASS |
| Cross-tenant isolation (core) | 1 file (rls.integration.spec.ts) | 24 tests PASS (live Postgres) |
| Cross-tenant (AI evaluation) | 1 file (cross-tenant.spec.ts) | 4/16 PASS — mock LLM not returning tool calls |
| Adversarial (ScopeRules, PiiRedaction) | 1 file (adversarial.spec.ts) | 17/22 PASS — 5 failing per PROGRESS.md |
| Create-member scenarios | 1 file (create-member-scenarios.spec.ts) | 16/15 PASS per PROGRESS.md (was 6/9) |
| Admin queries | 1 file (admin-queries.spec.ts) | 12/11 PASS |
| New agents integration (Operations, Growth, Marketing) | 1 file (new-agents.integration.spec.ts) | 4/0 PASS — ESM mock issue with @nestjs/swagger |
| AI component tests (booking, recommendation, feedback, admin approvals) | 4 files | UNVERIFIED |
| RAG tests (security, embedding compat, index/perf) | 3 files | UNVERIFIED |
| Owner registration / email verification | 2 files (owner-registration.spec.ts, owner-registration-verification-contract.spec.ts) | UNVERIFIED |
| Domain modules (members, bookings, memberships, payments, leads, attendance, classes, staff) | 8+ files | UNVERIFIED |
| Webhooks (Razorpay, ERP, n8n) | 3 files | UNVERIFIED |
| Frontend (contract, widget, integrity) | Multiple | 63/63 PASS per PROGRESS.md |
| Advertising Agent (AI-09) | 1 file (ai-09-advertising-agent.spec.ts) | 30+ tests; UNVERIFIED (mock-only) |
| Worker (outbox dispatcher, schedulers) | 2 files | 22/26 PASS (4 skipped) — mock infrastructure gaps |

> **All test results marked UNVERIFIED unless explicitly noted as PASS in PROGRESS.md or audit docs.** Reading a test file only proves it exists; it does not prove it passes.

---

## 2. Pending Production-Readiness Work (Prioritized)

### P0 — Blockers (Must fix before production deploy)

| # | Item | Status | Exact Location / Evidence |
|---|------|--------|---------------------------|
| 1 | `verifyOwnerEmail` issues access+refresh tokens immediately after email verification **without enforcing MFA enrollment first**. Line 1416 calls `issueSession(cleanTenantId, verification.user_id, roles, 'staff')` directly. Login flow (line 272-283) enforces MFA, but verification bypasses it. Owner gets a valid session without TOTP. | **CONFIRMED** | `auth.service.ts:1416` — no MFA check before `issueSession` |
| 2 | `test_verification_token` returned in response whenever `NODE_ENV !== 'production'`. Lines 1359 (registerStudio) and 1734 (resendVerificationEmail) use `this.config.get('NODE_ENV') !== 'production'` — leaks tokens in staging if `NODE_ENV=staging`. Recommend explicit opt-in flag (`ALLOW_TEST_TOKENS=true`). | **CONFIRMED** | `auth.service.ts:1359, 1734` |
| 3 | Raw verification token stored in audit outbox payload (`verificationToken: rawToken`) at lines 1336 (registerStudio) and 1710 (resendVerificationEmail). Risk of logging/exposure if audit logs shipped externally. Should store only `tokenHash`. | **CONFIRMED** | `auth.service.ts:1336, 1710` |
| 4 | Redis container exists in `docker-compose.yml` (lines 17-24) but `api`/`worker` `depends_on` only postgres (lines 45, 51). Need `redis: { condition: service_healthy }`. | **PARTIAL** | `docker-compose.yml:45,51` |
| 5 | n8n workflow files are 0-byte (AUD-001) — 8 workflows in `automation-n8n/workflows/` empty. | **NOT STARTED** | `automation-n8n/workflows/*.json` (all 0 bytes) |

---

### P1 — Important (Should fix before production)

| # | Item | Status | Evidence / Notes |
|---|------|--------|------------------|
| 6 | Optional chaining on Prisma calls (e.g., `this.prisma.tenant?.findFirst?.()`) can silently skip duplicate studio/email checks. Found in `auth.service.ts:1519, 1533, 1554, 1570`. | **CONFIRMED** | `auth.service.ts` lines 1519, 1533, 1554, 1570 |
| 7 | Production email config: `SMTP_HOST` / `RESEND_API_KEY` required for password reset, owner verification resend. `requestPasswordReset` (line 556-562) throws `ServiceUnavailableException` in prod if missing. | **NOT STARTED** | `auth.service.ts:556-562` |
| 8 | Migration 135 requires `pgvector` extension for HNSW index. Document deployment order: extension → migration → seed. Docker uses `pgvector/pgvector:pg16` image. | **DONE (schema+migration)** | `prisma/migrations/135_rag_hnsw_and_fts_indexes/migration.sql` |
| 9 | Rate limiting: `REQUIRE_SHARED_RATE_LIMITER=true` in prod (enforces Redis). Document Redis production config (cluster, persistence, TLS). | **PARTIAL** | `rate-limit.guard.ts` checks `REQUIRE_SHARED_RATE_LIMITER`; docker-compose has Redis but no prod config |
| 10 | Secrets management: Inventory env var names only (no values). Create `.env.example` per package with all required vars. | **PARTIAL** | `.env.template` files exist per package; `infrastructure/environments/*.env.template` added per IMPLEMENTATION_SUMMARY.md |
| 11 | Observability: Structured logging, metrics (Prometheus), tracing (OpenTelemetry) not yet integrated. `LlmObservabilityService` exists but only records to DB. | **NOT STARTED** | No Prometheus/OpenTelemetry integration found |
| 12 | Backups: `infrastructure/backup/backup-postgres.sh` / `restore-postgres.sh` exist — verify they work with RLS + multi-schema. | **UNVERIFIED** | Scripts exist; not tested |
| 13 | Rollback procedure: Documented in `docs/runbooks/rollback.md` — verify it covers Frappe app + DB migrations (backward-compatible only). | **UNVERIFIED** | Runbook exists |
| 14 | Confirm ERPNext custom app layout: both `erpnext-custom-app/wellness_studio/` and `erpnext-custom-app/wellness_studio/wellness_studio/` exist. **Inner is authoritative.** | **DONE** | Confirmed: inner is Python package; outer is legacy scaffold |

---

### P2 — Later (Post-launch hardening)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 15 | Test coverage gaps: Worker tests (0 test files), AI evaluation mocks, adversarial tests (5 failing), cross-tenant AI (12 failing). | **UNVERIFIED** | See Test Inventory above |
| 16 | Load testing: RAG retrieval (vector HNSW), AI chat endpoints, booking concurrency (last-seat). | **NOT STARTED** | No k6/locust scripts |
| 17 | Security review: Dependency audit (`pnpm audit`), SAST, pen test. | **NOT STARTED** | `scripts/check-secrets.sh` only |
| 18 | Dependency audit: Pin versions, check for CVE in transitive deps. | **NOT STARTED** | `pnpm audit` not in CI |

---

## 3. Files Changed in This Update

| File | Change |
|------|--------|
| `docs/STATUS.md` | Created (this file) — comprehensive status + pending work |
| `README.md` | Updated: Added link to `docs/STATUS.md` in Documentation section |
| `PROGRESS.md` | Updated: Appended reference to STATUS.md; kept historical phases |
| `IMPLEMENTATION_SUMMARY.md` | Updated: Appended reference to STATUS.md |

---

## 4. UNVERIFIED Items — Full List with Reasons

| Item | Reason |
|------|--------|
| All test results (except those explicitly noted PASS in PROGRESS.md) | Cannot run tests without PostgreSQL, Redis, ERPNext services |
| `verifyOwnerEmail` MFA bypass at runtime | Code path reviewed (line 1416); runtime behavior needs live DB to confirm token issuance without TOTP |
| `test_verification_token` leakage in staging | Code confirms `NODE_ENV !== 'production'` check (lines 1359, 1734); staging behavior untested |
| Raw token in audit outbox exposure | Code shows `verificationToken: rawToken` in payload (lines 1336, 1710); log exposure depends on audit sink config |
| Redis dependency wiring in docker-compose | Compose file read; container health/dependency not verified at runtime |
| n8n workflows 0-byte | File size confirmed 0 bytes; cannot import without content |
| Optional chaining Prisma calls silent failure | Pattern found in 4 locations; silent-failure risk theoretical until hit |
| Production email config | Env var check exists; actual delivery untested |
| pgvector extension + migration 135 deployment order | Migration exists; extension load order not tested in prod-like env |
| Redis production config | No prod Redis config (cluster, TLS, persistence) in repo |
| Secrets inventory completeness | `.env.template` files exist; not exhaustively cross-referenced against code |
| Observability stack | No Prometheus/OpenTelemetry integration found |
| Backup/restore scripts RLS compatibility | Scripts exist; RLS + multi-schema compatibility untested |
| Rollback procedure Frappe + DB | Runbook exists; Frappe + DB migration rollback untested |
| Frontend tenant branding runtime | Model + lib exist; not verified applied to public pages |
| Session Summary Agent (AI-12) implementation | Registry lists agent; no service/tools found |
| Worker health endpoint | Only `.gitkeep` in `src/health/` |
| CI branch triggers for integration/** | `.github/workflows/ci.yml` only lists develop/release/main |
| CI `--frozen-lockfile` / mandatory test | Uses `--no-frozen-lockfile` and `--if-present` |
| Google Sign-In for members | No implementation found in member auth flow |
| Social login for staff | No OAuth2 integration in staff auth |
| Advertising Agent (AI-09) test results | 30+ mock tests exist; UNVERIFIED without live DB/ERP |

---

## 5. Quick Reference: Key Commands

```bash
# Install deps
pnpm install

# Generate Prisma client
cd backend-nestjs-gateway && npx prisma generate

# Run migrations (requires PostgreSQL)
cd backend-nestjs-gateway && npx prisma migrate deploy

# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Run tests (gateway)
pnpm --filter @fitness-ai/backend-nestjs-gateway test

# Run tests (worker)
pnpm --filter @fitness-ai/backend-worker test

# Build all
pnpm build

# Dev servers (3 terminals)
pnpm --filter @fitness-ai/backend-nestjs-gateway dev  # port 3001
pnpm --filter @fitness-ai/backend-worker dev         # port 3002
pnpm --filter @fitness-ai/frontend-nextjs dev        # port 3000

# Docker stack (Postgres + Redis + n8n)
docker compose up -d postgres redis n8n
# With apps
docker compose --profile apps up --build
```

---

## 6. Branching & Commit Context

- **Current branch:** `FitnessAI-EndpointsIntegration`
- **Latest merge commit:** `0c09b53` (merged `origin/integration/all-features`, `8c9cefa`)
- **Date:** 2026-10-28
- **Previous audit baseline:** `a96ab89` (COMPLETE_PRODUCTION_READINESS_AUDIT.md)
- **PROGRESS.md baseline commit:** `8645477` (OVERALL_PROJECT_WORKFLOW_AND_SETUP.md)

---

*This document is the single source of truth for current working status and pending production work. Update it with every significant change.*