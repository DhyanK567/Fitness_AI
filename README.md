# Wellness Studio OS (fitness-ai)

Multi-tenant SaaS for dance, yoga, Zumba, meditation, fitness and other wellness studios. One platform runs leads, members, memberships, classes, bookings, attendance, events, payments, WhatsApp automation and reporting, with a governed AI assistant on top.

> **Status:** project skeleton complete (321 folders, ~502 files, workspace installed). Source files are placeholders and are being filled in module by module.

---

## Table of contents

1. [Product summary](#1-product-summary)
2. [Architecture](#2-architecture)
3. [Design rules](#3-design-rules)
4. [Tech stack](#4-tech-stack)
5. [Repository structure](#5-repository-structure)
6. [Module map](#6-module-map)
7. [Data ownership](#7-data-ownership)
8. [Request and event flows](#8-request-and-event-flows)
9. [Multi-tenancy and security](#9-multi-tenancy-and-security)
10. [AI architecture](#10-ai-architecture)
11. [Automation (n8n)](#11-automation-n8n)
12. [Getting started (Windows / PowerShell)](#12-getting-started-windows--powershell)
13. [Scripts](#13-scripts)
14. [Environments and deployment](#14-environments-and-deployment)
15. [Naming conventions](#15-naming-conventions)
16. [Roadmap](#16-roadmap)
17. [Documentation](#17-documentation)

---

## 1. Product summary

| Portal | Users | Purpose |
|---|---|---|
| **B2B Staff Portal** | Owner, Admin, Front Desk, Trainer | Run daily studio operations |
| **B2C Member Portal + Public Site** | Member, Visitor | Book, pay, check in, renew, enquire |

**Canonical flow (must pass end to end):**
Member -> Membership -> Class -> Booking -> Attendance -> Payment -> Notification -> Dashboard

**Phase 1 (5-day delivery):** operational core, WhatsApp and Razorpay in test/mock mode, and a narrow AI slice (Admin Assistant with two read queries plus Create Member).

---

## 2. Architecture

```text
                    ┌──────────────────────┐
                    │      Next.js Web     │
                    │   B2B + B2C Portal   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     NestJS API       │
                    │   Modular Monolith   │
                    ├──────────────────────┤
                    │ Auth                 │
                    │ Tenants              │
                    │ Members              │
                    │ Memberships          │
                    │ Classes              │
                    │ Bookings             │
                    │ Attendance           │
                    │ CRM                  │
                    │ Events               │
                    │ Payments             │
                    │ Reports              │
                    │ Staff                │
                    │ Notifications        │
                    │ AI                   │
                    └───────┬───────┬──────┘
                            │       │
                 ┌──────────┘       └──────────┐
                 ▼                             ▼
        ┌─────────────────┐          ┌─────────────────┐
        │ PostgreSQL      │          │ ERPNext/Frappe  │
        │ Platform data   │          │ Business truth  │
        │ IAM             │          │ Members         │
        │ Config          │          │ Memberships     │
        │ AI              │          │ Classes         │
        │ Audit           │          │ Bookings        │
        │ Notifications   │          │ Attendance      │
        │ Outbox          │          │ Payments        │
        └────────┬────────┘          └─────────────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Outbox Worker   │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │      n8n        │
        │ Automation      │
        └────────┬────────┘
                 │
          ┌──────┴───────┐
          ▼              ▼
     WhatsApp         Email
```

**External services:** Razorpay (payments), WhatsApp Cloud API (messaging), LLM provider (behind a gateway), Google Sign-In and a phone OTP provider (member login), transactional email (Phase 2).

**How the pieces relate**

- The browser talks only to the NestJS API. It never calls ERPNext or the database.
- NestJS is the single front door for the UI, the AI assistant, n8n and future agents.
- ERPNext (with our custom Frappe app) is the system of record for business data. PostgreSQL holds platform data (tenants, identity, configuration, audit, AI, notifications, outbox).
- Events are written to the outbox in the same database transaction as the audit record, after the ERP call succeeds. The worker delivers them to n8n, and n8n sends WhatsApp or email.
- ERP-originated events (expiry, timeouts) return to the API as signed callbacks so every event uses one path.

---

## 3. Design rules

1. **ERP is truth, AI assists.** Payments, memberships, bookings and attendance are deterministic logic. AI drafts, summarises and recommends.
2. **One front door.** Browsers, AI, n8n and agents always go through the API layer.
3. **Same capability, every channel.** The AI calls the same services the UI calls, with identical validation, permissions and audit.
4. **Configure, don't hard-code.** Plans, class types, capacity, templates, timings and branding are tenant data.
5. **Commit first, notify after.** Events are emitted only after the transaction commits, and consumers are idempotent.
6. **Modular monolith first.** One deployable API with strict module boundaries.
7. **Least privilege.** Restricted ERP integration identity. AI inherits the invoking user's permissions.
8. **Fail visibly, never falsely.** Unknown state is reported as pending or failed, never guessed as success.
9. **ERPNext core is never modified.** All product logic lives in the custom Frappe app.

---

## 4. Tech stack

| Layer | Technology | Hosting |
|---|---|---|
| Web (B2B + B2C) | Next.js, TypeScript, Tailwind CSS | Oracle Cloud |
| API / business layer | NestJS (modular monolith), OpenAPI-first | Oracle Cloud |
| Background worker | NestJS (same image, worker entry) | Oracle Cloud |
| Application DB | PostgreSQL + Prisma | Oracle Cloud |
| ERP | ERPNext on Frappe + custom app `wellness_studio` | Frappe Cloud |
| Workflow engine | n8n (self-hosted) | Oracle Cloud |
| Messaging | WhatsApp Cloud API (mock mode in Phase 1) | Meta |
| Payments | Razorpay (test mode in Phase 1) | Razorpay |
| AI | Commercial LLM via API (provider TBD), behind a gateway | External |
| Monorepo tooling | pnpm workspaces + Turborepo | GitHub |
| CI/CD | GitHub Actions | GitHub |

Redis and object storage are intentionally left out and will be added only if needed.

---

## 5. Repository structure

```text
fitness-ai/
├── frontend-nextjs/            # Web app: staff portal, member portal, public site
├── backend-nestjs-gateway/     # NestJS API: the single layer between web and ERP
├── backend-worker/             # Outbox dispatcher, schedulers, async AI jobs
├── erpnext-custom-app/         # Custom Frappe app on ERPNext (core untouched)
├── automation-n8n/             # n8n workflows (exported JSON)
├── shared/                     # Packages shared by frontend and backend
├── infrastructure/             # Docker, proxy, Oracle Cloud, monitoring, backups
├── tests/                      # Cross-app tests (E2E, isolation, concurrency, AI)
├── docs/                       # Product, architecture, database, ADRs, runbooks
├── scripts/                    # Dev and ops helper scripts
├── .github/                    # CI/CD workflows, CODEOWNERS, PR template
├── package.json                # Root workspace (name: fitness-ai)
├── pnpm-workspace.yaml         # Workspace package list
├── turbo.json                  # Build/dev task pipeline
├── docker-compose.yml          # Local dev stack
└── README.md
```

### 5.1 `frontend-nextjs/`

```text
frontend-nextjs/
├── src/
│   ├── app/
│   │   ├── (public)/               # No login, SEO pages
│   │   │   ├── classes/  events/  enquiry/  workshop-registration/
│   │   ├── (auth)/
│   │   │   ├── staff-login/  member-login/  reset-password/
│   │   ├── (staff)/                # B2B portal
│   │   │   ├── dashboard/  members/  memberships/  classes/  bookings/
│   │   │   ├── attendance/  leads/  events/  payments/  reports/
│   │   │   ├── staff/  notifications/  settings/  ai-assistant/
│   │   ├── (member)/               # B2C portal
│   │   │   ├── home/  my-membership/  book-class/  check-in/  events/
│   │   │   ├── my-payments/  my-profile/  recommendations/
│   │   └── layout.tsx  error.tsx  loading.tsx  not-found.tsx
│   ├── features/                   # One folder per business domain
│   │   └── <domain>/{components,hooks,api,schemas}/ + index.ts
│   │       (members, memberships, classes, bookings, attendance, leads,
│   │        events, payments, reports, staff, settings, notifications,
│   │        dashboard, ai)
│   ├── components/
│   │   ├── layout/                 # Sidebar, TopBar, BottomNav
│   │   ├── tables/  forms/
│   │   └── feedback/               # Loading, Empty, Error, PermissionDenied
│   ├── lib/
│   │   ├── api-client/             # Generated from the OpenAPI contract
│   │   ├── auth/  permissions/  tenant-theme/  utils/
│   ├── styles/
│   └── middleware.ts               # Host -> tenant resolution, route protection
├── public/
├── tests/{components,ui-e2e}/
└── next.config.ts  tailwind.config.ts  tsconfig.json  Dockerfile  package.json
```

Rules: no business rules in components, no secrets in client code, permission-aware UI (hide, but the server enforces), and every screen has loading, empty, error and permission-denied states.

### 5.2 `backend-nestjs-gateway/`

```text
backend-nestjs-gateway/
├── src/
│   ├── main.ts  app.module.ts
│   ├── common/                     # Cross-cutting building blocks
│   │   ├── guards/                 # auth, tenant, permission
│   │   ├── interceptors/           # correlation-id, audit, logging
│   │   ├── filters/  pipes/  decorators/  context/  errors/  constants/
│   ├── config/                     # Env loading and validation
│   ├── health/                     # Liveness / readiness
│   ├── platform/                   # Data stored in PostgreSQL
│   │   ├── tenants/  auth/  users/  roles-permissions/
│   │   ├── settings/  audit/  feature-flags/
│   ├── modules/                    # Business domains (data lives in ERPNext)
│   │   ├── members/  memberships/  classes/  bookings/  attendance/
│   │   ├── leads/  events/  payments/  reports/  staff/
│   │   ├── dashboard/  recommendations/  feedback/
│   ├── notifications/              # templates, delivery-records, outbox, webhooks
│   ├── integrations/               # One adapter per external system
│   │   ├── erp/  razorpay/  whatsapp/  email/  otp-provider/  llm/
│   ├── ai/
│   │   ├── gateway/  orchestrator/  tools/  pending-actions/
│   │   ├── guardrails/  prompts/  evaluation/
│   │   ├── assistants/{admin,enquiry,booking,recommendation,feedback}/
│   │   └── agents/{crm,operations,marketing,advertising,growth,insights,session-summary}/
│   └── webhooks/                   # Inbound: razorpay, erp-events, n8n
├── prisma/
│   ├── schema.prisma
│   ├── migrations/                 # Backward-compatible only
│   ├── rls-policies/               # Row-level security SQL
│   └── seeds/                      # Demo tenant, default config
├── test/{integration,contract}/
└── Dockerfile  nest-cli.json  tsconfig.json  package.json
```

Every domain module has the same shape: `<domain>.controller.ts`, `.service.ts`, `.policy.ts`, `.module.ts`, plus `dto/` and `tests/`. Platform modules also have a `.repository.ts`.

### 5.3 `backend-worker/`

```text
backend-worker/
└── src/
    ├── main.ts  worker.module.ts
    ├── outbox-dispatcher/          # Sends committed events to n8n (retry, dedup, dead-letter)
    ├── schedulers/
    │   ├── membership-expiry/
    │   ├── payment-status-check/   # Reconciles stale Pending payments
    │   ├── event-hold-expiry/
    │   └── nightly-reconciliation/
    ├── ai-jobs/                    # Async feedback classification
    └── health/
```

### 5.4 `erpnext-custom-app/`

```text
erpnext-custom-app/
├── pyproject.toml  README.md  license.txt
└── wellness_studio/
    ├── hooks.py                    # doc_events, scheduler, permission hooks
    ├── install.py  modules.txt  patches.txt
    ├── api/                        # Whitelisted atomic methods
    │   ├── booking.py  waitlist.py  check_in.py
    │   ├── membership_activation.py  reports.py
    ├── rules/                      # eligibility, capacity, membership_state
    ├── permissions/                # tenant_scope (tenant query hooks)
    ├── events/                     # signed_callback (ERP -> API)
    ├── scheduler/                  # membership_expiry
    ├── config/  fixtures/  patches/  tests/
    └── wellness_studio/            # Main module
        ├── doctype/
        │   ├── ws_member/  ws_membership_plan/  ws_membership/
        │   ├── ws_class_type/  ws_class_session/
        │   ├── ws_booking/  ws_waitlist_entry/
        │   ├── ws_attendance/  ws_attendance_correction/
        │   ├── ws_lead/  ws_event/  ws_event_registration/
        │   └── ws_payment/
        └── report/
```

The `ws_` prefix keeps custom DocTypes separate from ERPNext's own. The inner folder uses snake_case because Python packages cannot contain hyphens. The exact DocType mapping is a Day-1 design task.

### 5.5 `automation-n8n/`

```text
automation-n8n/
├── workflows/
│   ├── lead-confirmation.json      ├── renewal-reminders.json
│   ├── booking-confirmation.json   ├── payment-received.json
│   ├── class-reminders.json        ├── event-registration.json
│   ├── send-message.json           # Shared sub-workflow: mock/live, retry, status
│   └── failure-alert.json
├── credentials.template.md         # Credential names only, never secrets
└── deploy/                         # import-workflows.sh, export-workflows.sh
```

### 5.6 `shared/`

```text
shared/
├── api-contracts/          # OpenAPI spec + generated clients   (@fitness-ai/api-contracts)
├── ui-design-system/       # Shared components and tokens       (@fitness-ai/ui-design-system)
├── ai-tool-definitions/    # Tool schemas for API and eval      (@fitness-ai/ai-tool-definitions)
├── shared-types/           # Enums, event names, error codes    (@fitness-ai/shared-types)
├── eslint-config/          #                                    (@fitness-ai/eslint-config)
├── typescript-config/      # base.json                          (@fitness-ai/typescript-config)
└── test-utils/             # Factories, fixtures, mocks         (@fitness-ai/test-utils)
```

### 5.7 `infrastructure/`, `tests/`, `docs/`, `scripts/`

```text
infrastructure/
├── docker/            # frontend, backend, worker, n8n Dockerfiles
├── reverse-proxy/     # nginx.conf (wildcard TLS for tenant subdomains)
├── oracle-cloud/      # VM and network provisioning
├── monitoring/        # alerts.yml, uptime-checks.yml
├── backup/            # backup-postgres.sh, restore-postgres.sh
└── environments/      # development / staging / production .env templates

tests/
├── e2e-canonical-flow/        # Member -> ... -> Dashboard
├── tenant-isolation/          # Cross-tenant denial tests
├── concurrency-last-seat/     # 50 parallel last-seat bookings -> exactly one wins
├── ai-evaluation/             # Assistant queries and Create Member scenarios
└── contract-erp-adapter/      # Adapter <-> custom app compatibility

docs/
├── product/  architecture/  database/  api/  test-evidence/
├── decisions/                 # ADRs (0001-use-erpnext, 0002-single-nestjs-gateway)
└── runbooks/                  # deploy, rollback, incident-response, onboard-new-tenant

scripts/
└── setup-local.sh  seed-demo-tenant.sh  generate-api-client.sh  check-secrets.sh
```

### 5.8 Workspace packages

pnpm sees 11 packages: the root `fitness-ai`, `@fitness-ai/frontend-nextjs`, `@fitness-ai/backend-nestjs-gateway`, `@fitness-ai/backend-worker`, and the 7 `@fitness-ai/*` packages under `shared/`.

---

## 6. Module map

**Staff (B2B) modules:** Dashboard, CRM (leads), Members, Memberships, Classes, Bookings, Attendance, Events, Payments, Reports, Staff Management, Settings (Configuration Center), Notifications, AI Assistant, Tenant Management.

**Member (B2C) modules:** Dashboard, Membership, Bookings, Attendance (QR check-in), Events, Payments, Profile, Notifications, Recommendations, Public site.

Every module is tenant-scoped, permission-checked, audit-logged and has loading, empty, error and permission-denied UI states.

---

## 7. Data ownership

| Data | Owner |
|---|---|
| Members, memberships, plans, class types, sessions, bookings, attendance, events, registrations, payments, invoices, leads | **ERPNext** (business truth) |
| Tenants, studios, branches, SaaS tier and feature flags | PostgreSQL |
| Users, credentials, roles, permissions, grants, sessions, OTP/Google links | PostgreSQL (members are not ERP users) |
| Branding, notification templates, reminder timings, cancellation window, default capacity | PostgreSQL |
| Audit log (including AI), pending AI actions, AI conversations (temporary) | PostgreSQL (append-only audit) |
| Notification records, delivery status, outbox events | PostgreSQL |
| Workflow definitions | Git (n8n exports) |

Rule of thumb: if losing it would corrupt a business fact, it lives in the ERP. If it governs who may do what, how it is delivered, or how it is presented, it lives in the application layer.

There is no bidirectional entity sync. All ERP-owned reads and writes go through the ERP adapter at request time.

---

## 8. Request and event flows

**Write path (booking example)**

1. Next.js sends the request with a JWT. The tenant comes from the host.
2. NestJS runs the auth, tenant and permission guards, then validation.
3. The ERP adapter calls the custom Frappe app with the integration identity, tenant and correlation ID.
4. The Frappe method locks the session and checks eligibility, limit, duplicate and capacity in one transaction.
5. The result (Confirmed, Waitlisted or Rejected with reason) returns to NestJS.
6. NestJS writes the audit record and the outbox event in one PostgreSQL transaction.
7. The worker delivers `booking.confirmed` to n8n as a signed webhook, and n8n sends the WhatsApp template.
8. The delivery status returns to the API and is stored.

**Read path:** UI or AI -> API (permission and tenant scope) -> ERP for business data, or PostgreSQL for app data. Dashboards and the AI Assistant share one reporting service, so their figures are identical.

**Payments:** API creates a Razorpay order -> client pays -> Razorpay webhook (signature verified, idempotent) -> payment marked Paid -> posted to ERP -> `payment.confirmed` event. A delayed webhook leaves the payment Pending, and it is never guessed as paid.

---

## 9. Multi-tenancy and security

**Hierarchy:** Tenant -> Studio -> Branch, carried on every record from day one.

| Layer | Isolation |
|---|---|
| Request | Tenant resolved from host, bound to the JWT, rejected on mismatch |
| API / services | Every service and repository is tenant-scoped, with no unscoped query path |
| PostgreSQL | Tenant column on every table plus row-level security |
| ERP | Tenant link on every custom DocType plus permission-query hooks in the custom app |
| AI | Tool calls run under the invoking user's tenant, with no cross-tenant retrieval |
| Automation | Every event carries the tenant ID, and templates and credentials are per tenant |

**Security baseline**

- Staff: email and password (MFA for Owner and Admin before production). Members: phone OTP, optional Google sign-in.
- Roles: Owner, Admin, Front Desk, Trainer, Member, Visitor, plus a platform administrator.
- Central policy service, with no inline `role === "admin"` checks.
- Webhooks: signature verification, replay window and idempotency.
- Secrets live in a secret store, never in Git or client code. Only `.env.example` files are committed.
- Cross-tenant attempts return not-found style responses and are audit-logged.
- Audit records are append-only and carry a correlation ID from UI to API to ERP to n8n to WhatsApp.

---

## 10. AI architecture

The AI module lives inside the NestJS API in Phase 1.

- **LLM Gateway:** provider-agnostic interface with tool-calling, timeouts and retries.
- **Tool Registry:** each tool has a name, argument schema, required permission and risk class. Tools are filtered per user, tenant and tier.
- **Pending Action Store:** write actions are proposed first, then confirmed. Only the stored arguments execute.
- **Guardrails:** scope refusal, no medical advice, PII minimisation, and answers derived from tool results only.
- **AI Audit:** one immutable record per model-initiated tool call.

**Phase 1 assistants:** Admin (two read queries plus Create Member), Enquiry, Booking (suggestions only), Recommendation, Feedback.
**Phase 2 and later agents:** CRM, Operations, Marketing, Advertising, Growth Optimization, Studio Insights, Session Summary. All are governed, and any action needs human approval.

AI never reads or writes the database directly. It calls the same services as the UI.

---

## 11. Automation (n8n)

n8n orchestrates and never owns business state.

`outbox event -> signed webhook -> n8n workflow -> send-message sub-workflow -> WhatsApp (or mock) -> delivery status webhook -> API`

- **Idempotency:** key = event ID + recipient + template.
- **Consent:** checked in the API before any message is released.
- **Mock mode:** an environment switch inside `send-message`. It stores a would-send record until production credentials exist.
- **Failures:** bounded retries with back-off, then a failed status and an admin alert. A failed message never reverses a transaction.

Phase 1 automations: lead confirmation, booking confirmation, class reminders (12h and 1h), renewal reminders (7, 3 and 1 days plus expiry day), payment received, and event registration confirmation.

---

## 12. Getting started (Windows / PowerShell)

**Prerequisites**

- Node.js 20 or newer (tested with 24.x)
- pnpm (tested with 12.6.0): `npm install -g pnpm`
- Git
- Docker Desktop (for the local PostgreSQL and n8n stack)
- A Frappe Cloud site for the ERP (avoid heavy local ERP runtimes)

**Setup**

```powershell
cd C:\dev\fitness-ai
pnpm install
pnpm approve-builds     # allow: @nestjs/core, @prisma/client, @prisma/engines, prisma
pnpm install
```

Keep the project **outside OneDrive** (for example `C:\dev\fitness-ai`), because OneDrive syncing `node_modules` is slow and can lock files.

**Verify the workspace**

```powershell
pnpm -r list --depth -1     # should list 11 packages
```

**Environment files:** copy each `.env.example` to `.env` and fill in the values. Never commit `.env`.

---

## 13. Scripts

Run from the repository root.

| Command | Action |
|---|---|
| `pnpm dev` | Run all apps in dev mode (via Turborepo) |
| `pnpm build` | Build all packages |
| `pnpm test` | Run tests |
| `pnpm typecheck` | TypeScript checks |

Per package: `pnpm --filter @fitness-ai/frontend-nextjs dev` (port 3000), `pnpm --filter @fitness-ai/backend-nestjs-gateway dev`, and `pnpm --filter @fitness-ai/backend-nestjs-gateway prisma:generate`.

Note: builds and dev servers will only work once the placeholder source files have real code.

---

## 14. Environments and deployment

| | Development | Staging (UAT, demo) | Production |
|---|---|---|---|
| Web and API | Docker Compose locally | Oracle Cloud VM (containers) | Oracle Cloud, load balanced when needed |
| PostgreSQL | Local container | Separate seeded instance | Managed, backups with PITR |
| ERP | Shared Frappe Cloud dev site | Frappe Cloud staging site | Frappe Cloud production site |
| WhatsApp / Razorpay | Mock / test | Mock / test | Live (Phase 2) |

**Pipeline (GitHub Actions):** `ci.yml`, `deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`, `tenant-isolation-suite.yml`, `ai-evaluation.yml`.

**Production rollout order:** Frappe custom app, then database migrations (backward-compatible), then API and worker, then web, then n8n workflows, followed by smoke tests.

Rollback: redeploy the previous container tags, roll back the Frappe app, and use only backward-compatible migrations (expand, migrate, contract).

---

## 15. Naming conventions

- **Folders and files:** kebab-case (`my-membership`, `send-message.json`). The exception is the Frappe app, which uses snake_case.
- **NestJS files:** `<domain>.<role>.ts` (for example `bookings.service.ts`, `bookings.policy.ts`).
- **React components:** PascalCase files (`Sidebar.tsx`). Route folders follow Next.js conventions.
- **Custom DocTypes:** `ws_` prefix (`ws_booking`).
- **Packages:** `@fitness-ai/<folder-name>`.
- **Folder names use business language:** `leads`, not `crm-entity`. `check-in`, not `attendance-qr-flow`.
- **Dependency direction:** controllers -> services -> ERP adapter or repositories. AI tools call the same services and never the ERP or database directly.
- **Commits:** conventional style (`chore:`, `feat:`, `fix:`, `docs:`).

---

## 16. Roadmap

| Phase | Scope |
|---|---|
| **Phase 1 (5 days)** | Tenant/studio/branch, six-role access, audit, members, memberships, classes, bookings, attendance, events (basic), payments (test), CRM, configuration center, dashboards, WhatsApp mock automations, member portal, Admin AI Assistant slice |
| **Phase 2** | Freeze/credits/upgrades, refunds and invoices, event waitlist, email, MFA, production WhatsApp and Razorpay, self-service onboarding, CRM and Operations agents |
| **Phase 3** | Marketing, Advertising, Growth Optimization and Studio Insights agents, forecasting |
| **Future** | Multi-branch and franchise, white-label domains, native apps, marketplace, regional languages |

**Cut order if time slips:** booking suggestions and recommendations, feedback assistant, enquiry assistant, paid-event payment, Create Member action, read queries. Core modules, permissions, tenant isolation and audit are never cut.

---

## 17. Documentation

Place the project documents in `docs/`:

- `STATUS.md` — **Current working status & pending production-readiness work** (single source of truth)
- `docs/product/` - Master PRD, module specification
- `docs/architecture/` - Solution architecture document
- `docs/database/` - Database design document
- `docs/decisions/` - Architecture decision records
- `docs/runbooks/` - Deploy, rollback, incident response, tenant onboarding
- `docs/test-evidence/` - Recorded test results for the Definition of Done

**Open decisions** (from the PRD): mentor confirmation of the single API layer, client validation of default rules (capacity 30, 4-hour cancellation cutoff), the AI provider, the OTP provider, tier pricing, and the legal review of consent and messaging opt-in.

---

*Confidential. Internal use.*
