# Wellness Studio OS — Overall Project Workflow, Architecture, Setup & Operations Handbook

**Document Version:** 2.0.0  
**Target Repository:** Fitness AI / Wellness Studio OS (`fitness-ai`)  
**Target Branch:** `integration/all-features`  
**Verified Baseline Commit:** `8645477472d856c384a6d26625356f68478e790f`  
**Audience:** Developers, New Teammates, Technical Leads, Platform Engineers, System Maintainers, and Presenters  
**Last Updated:** October 2026  

---

## Table of Contents
1. [Project Introduction and Executive Summary](#1-project-introduction-and-executive-summary)
2. [Glossary of Core Technical Concepts](#2-glossary-of-core-technical-concepts)
3. [Complete System Architecture](#3-complete-system-architecture)
4. [Repository Navigation Guide](#4-repository-navigation-guide)
5. [Prerequisites and Tooling Checklist](#5-prerequisites-and-tooling-checklist)
6. [First-Time Setup from Clean Checkout](#6-first-time-setup-from-clean-checkout)
7. [Environment Configuration Reference](#7-environment-configuration-reference)
8. [Service Startup, Health Checks, and Shutdown](#8-service-startup-health-checks-and-shutdown)
9. [End-to-End Application Workflows](#9-end-to-end-application-workflows)
10. [API, Database, and Integration Reference](#10-api-database-and-integration-reference)
11. [Testing and Quality Assurance Matrix](#11-testing-and-quality-assurance-matrix)
12. [Troubleshooting and Incident Recovery Handbook](#12-troubleshooting-and-incident-recovery-handbook)
13. [Current Implementation and Readiness Matrix](#13-current-implementation-and-readiness-matrix)
14. [Deployment and Operational Handover](#14-deployment-and-operational-handover)
15. [New Developer Onboarding Checklist](#15-new-developer-onboarding-checklist)
16. [References and Authoritative Documentation](#16-references-and-authoritative-documentation)

---

## 1. Project Introduction and Executive Summary

### 1.1 Product Purpose and Business Problem
Boutique fitness studios, yoga centers, and gym chains frequently suffer from **operational fragmentation**. Studio managers are forced to juggle disconnected point solutions for customer relationship management (CRM), class scheduling, recurring membership billing, attendance check-in, and member retention. 

This fragmentation causes severe operational bottlenecks:
1. **Lost Revenue from Unmanned Hours**: Studies indicate that boutique fitness studios lose up to 40% of inbound prospective members who inquire outside regular front-desk operating hours.
2. **Staff Overhead**: Studio concierges spend hours answering repetitive inquiries regarding schedule availability, teacher credentials, and membership plan pricing.
3. **Data Silos**: Booking platforms do not communicate natively with double-entry accounting ledgers, requiring error-prone manual reconciliation at the end of each billing cycle.
4. **Member Churn**: Studios lack proactive, automated early warning systems to detect when member attendance declines before a membership is formally cancelled.

**Wellness Studio OS** (Fitness AI) resolves this fragmentation by unifying boutique studio operations into an enterprise multi-tenant platform powered by domain-specific autonomous AI agents. Rather than treating AI as an external novelty chatbot, the platform embeds AI directly into core transactional workflows (public lead capture, class schedule discovery, booking assistance, attendance retention alerts, and studio administrative copilots).

### 1.2 Intended User Personas and Roles
The platform enforces role-based access control (RBAC) across six primary personas:

| Role Identifier | Role Name | Description & Primary Capabilities |
|---|---|---|
| `visitor` | **Public Visitor / Prospect** | Anonymous user browsing studio offerings, checking public schedules/events, chatting with the AI Enquiry Assistant, and submitting lead information with explicit consent. |
| `member` | **Studio Member** | Authenticated studio client who purchases membership plans, reserves class slots, cancels bookings within policy windows, checks in via QR codes, and views personal attendance history. |
| `trainer` | **Instructor / Trainer** | Staff member who views assigned class rosters, checks in attending members, records class notes, and logs member fitness assessments. |
| `front_desk` | **Front-Desk Staff** | Operations staff managing day-to-day arrivals, walk-in inquiries, class check-ins, manual payment collection, and direct lead follow-ups. |
| `owner` / `admin` | **Studio Owner / Concierge** | Tenant administrator with full authority over studio configuration, staff accounts, class catalog schedules, membership tiers, AI conversation audits, and revenue reports. |
| `platform_admin` | **Platform Superadmin** | Infrastructure operator managing tenant provisioning, global subscription plans, platform system health, and cross-tenant isolation enforcement. |

### 1.3 Major Functional Modules
As defined in the project baseline specifications, the platform comprises five core subsystems:
* **Public Enquiry & Lead Funnel (`PUB`)**: Public marketing portal, responsive class catalog, membership preview, interactive AI enquiry widget, Cloudflare Turnstile anti-bot protection, and WhatsApp lead capture with explicit opt-in consent.
* **Authentication & IAM (`AUTH`)**: Multi-tenant JWT session management, Argon2id password hashing, Multi-Factor Authentication (TOTP MFA), Google OAuth identity linking, and tenant resolution via HTTP `Host` headers.
* **Studio Operations & ERP (`CORE`)**: Class scheduling, capacity utilization, automated waitlist management, membership tier entitlement, attendance tracking, and integration with Frappe/ERPNext for double-entry ledger accounting.
* **Autonomous AI Platform (`AI`)**: Centralized LLM gateway (Google Gemini & OpenAI), conversation turn orchestrator, Zod-enforced tool execution registry, PostgreSQL Row-Level Security (RLS) enforcement, FAQ knowledge retrieval, and staff copilot assistants.
* **Asynchronous Operations Engine (`OPS`)**: Transactional audit logging, PostgreSQL outbox pattern polling with `SELECT ... FOR UPDATE SKIP LOCKED`, exponential backoff retry dispatching, and n8n webhook notification delivery.

### 1.4 What Makes This Platform Different
1. **Kernel-Level Multi-Tenancy**: Tenant data isolation is not implemented as vulnerable `WHERE tenant_id = ...` application filters. Instead, isolation is enforced by the PostgreSQL database engine using **Row-Level Security (RLS)** policies tied to runtime session variables.
2. **Grounded, Non-Hallucinating AI**: The AI assistant answers inquiries using strictly approved studio FAQs and live database tools. Model prompt boundaries and negative guardrails prevent the fabrication of studio policies or rates.
3. **Reliable Outbox Delivery**: External notifications (such as WhatsApp messages or staff escalation alerts) are committed to an asynchronous outbox table within the same database transaction as the business event. If an external messaging provider is temporarily offline, requests are never dropped and retry automatically.
4. **Separation of Concerns**: High-frequency web interactions execute through an ultra-fast NestJS gateway, while complex accounting ledgers and billing books reside securely in an ERPNext custom application.

### 1.5 Non-Technical Executive Summary (For Managers & Stakeholders)
> **In Plain English:**  
> Wellness Studio OS is a smart digital operating system for modern boutique fitness studios. It acts as a 24/7 digital front desk and studio manager. When a potential member visits the studio website at midnight, an intelligent AI concierge answers their questions about yoga classes and membership prices using only official studio information. If the visitor wants to join, the system securely collects their contact details and sends an instant alert to the studio staff. Once members join, they use the same system to book classes, while studio owners track attendance, billing, and staff schedules in a single, secure dashboard.

---

## 2. Glossary of Core Technical Concepts

For teammates new to enterprise multi-tenant architectures, this glossary explains key concepts used throughout this documentation:

* **Multi-Tenancy**: An architecture where a single instance of software serves multiple distinct customer organizations (tenants), ensuring each studio's data is strictly invisible to all other studios.
* **PostgreSQL Row-Level Security (RLS)**: A database feature that automatically filters table rows based on the current user or tenant session variable. Even if a developer accidentally omits a `WHERE tenant_id = ...` clause, the database will never return another tenant's records.
* **Transactional Outbox Pattern**: A software pattern where business data changes and their outbound notification events are saved inside the **same atomic database transaction**. A separate background worker reads these events and sends them to external systems. This eliminates data loss during server restarts or network outages.
* **`FOR UPDATE SKIP LOCKED`**: A high-concurrency SQL command that allows multiple background worker instances to claim and process unhandled outbox events simultaneously without blocking each other or processing the same event twice.
* **Dead-Letter Queue (DLQ)**: A terminal holding state for asynchronous events that have repeatedly failed delivery after exhausting all configured retry attempts. This prevents failing events from clogging the queue while alerting developers to inspect the issue.
* **Sliding-Window Rate Limiting**: An algorithm that tracks request timestamps over a moving time window (e.g., the last 60 seconds) rather than fixed clock intervals. This prevents burst traffic attacks at boundary intervals.
* **Cloudflare Turnstile**: A modern, privacy-friendly CAPTCHA alternative that protects public web endpoints from automated scrapers and spam bots without forcing visitors to solve puzzle images.
* **Full-Text Search with `tsvector`**: A native PostgreSQL indexing capability that converts English sentences into searchable language roots (lexemes), allowing fast and accurate matching of questions against approved FAQs.
* **Frappe / ERPNext**: An open-source, Python-based enterprise resource planning framework that manages double-entry accounting, asset tracking, and ledger entries for Wellness Studio OS.

---

## 3. Complete System Architecture

### 3.1 Architectural Diagram
The following diagram illustrates the Decoupled Microservices Architecture of Wellness Studio OS:

```mermaid
graph TB
    subgraph ClientLayer ["1. Client Layer (Browser / Web)"]
        PublicWeb["Public Portal & Enquiry Chat Widget<br/>(Next.js 15 / React 19 / Port 3000)"]
        AdminWeb["Studio Admin & Member Dashboard<br/>(Next.js 15 / React 19 / Port 3000)"]
    end

    subgraph GatewayLayer ["2. API Gateway & Business Layer (Port 3001)"]
        NestGateway["NestJS API Gateway<br/>(Tenant Context, Authentication, RBAC)"]
        RateLimiter["Distributed Rate Limiter<br/>(Sliding Window via Redis)"]
        AiPlatform["AI Orchestrator & Tool Sandbox<br/>(Gemini 2.5 Flash / OpenAI Provider)"]
        AuditOutboxSvc["Audit & Outbox Producer<br/>(Atomic Dual-Write Engine)"]
    end

    subgraph CacheLayer ["3. Cache & Coordination Layer (Port 6379)"]
        RedisServer[("Redis 7 In-Memory Store<br/>Rate Limit Keys & Distributed Locks")]
    end

    subgraph DataLayer ["4. Persistence & Database Layer (Port 5432 / 5433)"]
        PostgresDB[("PostgreSQL 16 + pgvector<br/>Tenant RLS Isolation<br/>Schemas: platform, iam, config, ops, audit, ai, crm")]
    end

    subgraph WorkerLayer ["5. Asynchronous Worker Layer (Port 3002)"]
        WorkerService["NestJS Background Worker<br/>(Outbox Dispatcher & Schedulers)"]
    end

    subgraph AutomationLayer ["6. Automation & Integration Layer (Port 5678)"]
        N8nService["n8n Automation Engine<br/>(Workflow Notification Dispatcher)"]
    end

    subgraph BusinessERPLayer ["7. Core Business ERP Layer (Port 8000)"]
        FrappeERP["Frappe / ERPNext v15<br/>(Custom App: wellness_studio)<br/>Ledgers, DocTypes, Whitelisted RPCs"]
    end

    subgraph ExternalProviders ["8. External Upstream Providers"]
        Cloudflare["Cloudflare Turnstile API<br/>(CAPTCHA Verification)"]
        GeminiAPI["Google Gemini LLM API<br/>(generativeai / genai)"]
        MetaWhatsApp["Meta WhatsApp Cloud API<br/>(Customer Messaging)"]
        Razorpay["Razorpay Payment Gateway<br/>(Checkout & Webhooks)"]
    end

    %% Client connections
    PublicWeb -->|HTTP REST / JSON| NestGateway
    AdminWeb -->|HTTP REST + Bearer JWT| NestGateway

    %% Gateway internal routing
    NestGateway --> RateLimiter
    RateLimiter -->|TCP Pipeline| RedisServer
    NestGateway --> AiPlatform
    AiPlatform --> AuditOutboxSvc
    AiPlatform -->|HTTPS Completion| GeminiAPI
    NestGateway -->|Token Verify POST| Cloudflare
    NestGateway -->|Whitelisted REST RPC| FrappeERP
    NestGateway -->|Payment Order / Verify| Razorpay
    AuditOutboxSvc -->|SQL Transaction withTenant| PostgresDB

    %% Asynchronous Worker Polling
    WorkerService -->|FOR UPDATE SKIP LOCKED| PostgresDB
    WorkerService -->|Cron Distributed Locks| RedisServer
    WorkerService -->|POST /notify Webhook| N8nService
    N8nService -->|Outbound REST Message| MetaWhatsApp
```

### 3.2 Service Responsibilities and Data Ownership

| Subsystem | Primary Responsibilities | Data Store / Tables Owned | Communication Mechanism |
|---|---|---|---|
| **Frontend Client (`frontend-nextjs`)** | Renders public marketing portal, floating AI chat widget, member booking UI, and studio owner admin panels. Normalizes API routes and injects tenant Host headers. | Client browser state, local session storage | Outbound HTTP REST to Gateway (Port 3001) |
| **API Gateway (`backend-nestjs-gateway`)** | Ingress routing, tenant resolution, JWT issuance, Argon2id auth, rate limiting, RLS context injection, AI conversation turns, and audit outbox writes. | Coordinates all transactions across PostgreSQL schemas | Inbound HTTP on Port 3001; Outbound SQL, Redis TCP, HTTP RPC |
| **PostgreSQL Database (`pgvector:pg16`)** | Authoritative relational data persistence, schema separation, full-text search indexes (`search_tsv`), and kernel-level Row-Level Security. | Schemas: `platform`, `iam`, `config`, `ops`, `audit`, `ai`, `crm` | PostgreSQL TCP Protocol on Port 5432 (dev) / 5433 (test) |
| **Redis Cache (`redis:7-alpine`)** | Distributed atomic counters for sliding-window rate limiters, temporary token caches, and distributed locks for background cron schedulers. | In-memory key-value store (`ratelimit:*`, `lock:*`) | Redis TCP Protocol on Port 6379 |
| **Background Worker (`backend-worker`)** | Polls `ops.outbox_events` with `SKIP LOCKED`, recovers stale claims, applies exponential backoff, routes webhooks to n8n, and runs membership expiry cron jobs. | Updates `ops.outbox_events` status and attempts | Inbound HTTP `/health` on Port 3002; Outbound SQL and HTTP |
| **Frappe / ERPNext (`erpnext-custom-app`)** | Official double-entry accounting ledger, membership pricing masters, staff payroll, and custom studio DocTypes. | Frappe MariaDB / PostgreSQL backend | HTTP REST via whitelisted RPC methods on Port 8000 |
| **Automation Engine (`automation-n8n`)** | Low-code event workflows for customer communication, template rendering, and delivery to WhatsApp Graph API. | n8n internal SQLite/Postgres workflow store | Inbound Webhook on Port 5678; Outbound HTTPS |

### 3.3 Synchronous vs. Asynchronous Communication Boundaries
* **Synchronous (Request-Response)**:
  - Visitor submits a chat message $\to$ Gateway searches FAQs and prompts LLM $\to$ AI response returned immediately to browser.
  - Member submits login credentials $\to$ Gateway validates Argon2id hash and issues JWT $\to$ Token returned immediately.
  - Visitor submits CAPTCHA token $\to$ Gateway verifies token with Cloudflare Turnstile upstream $\to$ Session initialized.
* **Asynchronous (Event-Driven Outbox)**:
  - Visitor requests Human Staff Escalation $\to$ Gateway writes `ai.enquiry.escalated` event into `ops.outbox_events` and immediately returns `202 Accepted` to visitor $\to$ Background worker claims row, delivers to n8n webhook, and marks event `delivered`.
  - Member completes class booking $\to$ Gateway records `booking.created` in outbox $\to$ Worker asynchronously dispatches confirmation notification.

### 3.4 Multi-Tenant Resolution and RLS Context Injection
Every request processed by the API Gateway passes through the `TenantContextGuard`:
1. The guard inspects the inbound HTTP `Host` header (e.g. `studio-omega.fitness.local`) or explicit header `x-tenant-id`.
2. The gateway resolves the hostname against the `platform.tenants` table to retrieve the canonical `tenant_id` UUID.
3. Database operations execute inside the transactional wrapper `prisma.withTenant(tenantId, async (tx) => { ... })`.
4. Inside PostgreSQL, the wrapper executes `SELECT set_config('app.tenant_id', $1, true)`.
5. The PostgreSQL kernel enforces RLS policies across all tables:
   ```sql
   CREATE POLICY tenant_isolation ON ops.outbox_events
     FOR ALL
     USING (tenant_id = platform.current_tenant())
     WITH CHECK (tenant_id = platform.current_tenant());
   ```
6. If any query attempts to insert or read data belonging to another tenant, PostgreSQL rejects the query or returns zero rows.

---

## 4. Repository Navigation Guide

The repository is organized as a Turborepo monorepo using pnpm workspaces:

```
fitness-ai/
├── automation-n8n/                      # n8n Automation Engine configuration
│   ├── credentials.template.md         # Documentation for external service credentials (no secrets)
│   ├── deploy/                         # Scripts to import/export JSON workflows
│   └── workflows/                      # n8n JSON workflow templates (booking, lead notification)
│
├── backend-nestjs-gateway/              # Primary API Gateway and Core Business Subsystems
│   ├── Dockerfile                      # Production container image definition
│   ├── prisma/                         # Prisma schema and PostgreSQL migrations
│   │   ├── migrations/                 # 19 versioned SQL migrations (000_bootstrap to 120_faq)
│   │   ├── schema.prisma               # Multi-schema Prisma model definitions
│   │   └── migration_lock.toml         # Migration integrity lock
│   └── src/
│       ├── ai/                         # AI platform, LLM gateway, orchestrator, tools, and enquiry
│       │   ├── gateway/                # LlmGatewayService (Gemini & OpenAI client integration)
│       │   ├── guardrails/             # PII redaction, scope rules, and input validation
│       │   ├── knowledge/              # FaqKnowledgeService (Postgres tsvector full-text search)
│       │   ├── orchestrator/           # ConversationOrchestrator turn execution loop
│       │   ├── tools/                  # ToolRegistry, BaseTool, and 11 implemented tools
│       │   └── public-enquiry-ai.controller.ts # Public chat enquiry REST endpoints
│       ├── auth/                       # Member and staff authentication controllers & JWT
│       ├── common/                     # PrismaService, withTenant RLS wrapper, AuditOutboxService
│       ├── config/                     # Environment validation and security rules (environment.ts)
│       ├── erpnext/                    # Frappe/ERPNext API client adapter
│       └── tests/                      # Gateway unit, contract, and RLS integration tests
│
├── backend-worker/                      # Asynchronous Background Outbox Worker
│   ├── Dockerfile                      # Worker container image definition
│   └── src/
│       ├── ai-jobs/                    # Scheduled AI retention and churn background jobs
│       ├── common/                     # Prisma client, Redis client, and RLS wrappers
│       ├── main.ts                     # Worker bootstrap and HTTP /health server (Port 3002)
│       ├── outbox-dispatcher/          # OutboxDispatcherService (SKIP LOCKED polling, backoff, DLQ)
│       └── schedulers/                 # Cron-based membership expiry and class reminders
│
├── docs/                               # Approved project documentation and test evidence
│   ├── architecture/                   # Architectural technical specifications
│   ├── Project-Documentions/           # Authoritative approved specifications & handbooks
│   │   ├── OVERALL_PROJECT_WORKFLOW_AND_SETUP.md          # THIS DOCUMENT
│   │   ├── AI_IMPLEMENTATION_WORKFLOW_COMPONENTS_01_02.md # Companion AI Handbook
│   │   └── [7 Approved Baseline PDF Documents]
│   └── test-evidence/                  # Verification audit logs and test results
│
├── erpnext-custom-app/                  # Custom Frappe Application (wellness_studio)
│   ├── setup.py                        # Python package definition (Python >= 3.10)
│   └── wellness_studio/                # Frappe app source code
│       ├── api/                        # Whitelisted RPC endpoints (events, classes, leads, plans)
│       └── doctype/                    # Custom ERPNext DocType definitions
│
├── frontend-nextjs/                     # Next.js 15 Client Web Application
│   ├── Dockerfile                      # Frontend container image definition
│   └── src/
│       ├── app/                        # Next.js App Router pages
│       │   ├── (public)/               # Public portal marketing layout and pages
│       │   ├── admin/                  # Studio management and staff copilot dashboard
│       │   ├── member/                 # Member self-service booking and check-in portal
│       │   ├── auth/                   # Login, register, and password reset flows
│       │   └── enquiry/                # Standalone public enquiry and lead capture page
│       ├── features/ai/                # AI components (PublicEnquiryChatWidget, Copilot)
│       ├── lib/                        # API client, tenant resolution, authentication state
│       └── tests/                      # Frontend contract, widget, and integrity tests
│
├── shared/                             # Monorepo Shared TypeScript Packages
│   ├── ai-tool-definitions/            # Centralized AI tool JSON schemas and tool registries
│   ├── api-contracts/                  # DTO definitions, API routes, and payload types
│   ├── erp-methods/                    # Whitelisted Frappe RPC method string constants
│   ├── error-codes/                    # Canonical system-wide error code enumerations
│   ├── eslint-config/                  # Shared ESLint linting rules
│   ├── shared-types/                   # Shared TypeScript models and interfaces
│   ├── test-utils/                     # Shared test fixtures and mocking utilities
│   ├── typescript-config/              # Shared base tsconfig.json configurations
│   └── ui-design-system/               # Shared UI tokens, themes, and base components
│
├── docker-compose.yml                   # Local Docker stack definition (Postgres, n8n, apps)
├── package.json                         # Workspace root manifest (Turborepo + pnpm)
├── pnpm-workspace.yaml                  # pnpm workspace package definitions
└── turbo.json                           # Turborepo task execution pipeline
```

### Where to Implement Changes

| Development Task | Primary Directory to Edit | Key Files |
|---|---|---|
| **Add / Edit Frontend Screens** | `frontend-nextjs/src/app/` | Page routes, `PublicEnquiryChatWidget.tsx` |
| **Add / Edit Gateway API Endpoints** | `backend-nestjs-gateway/src/` | Relevant module controller, DTO in `dto/` |
| **Add / Edit AI Tools** | `backend-nestjs-gateway/src/ai/tools/` | Implement in `tools/`, register in `tool-registry.ts` |
| **Add / Edit Database Models** | `backend-nestjs-gateway/prisma/` | `schema.prisma`, generate migration via Prisma CLI |
| **Add Outbox Event Handlers** | `backend-worker/src/outbox-dispatcher/` | Register in `outbox-dispatcher.service.ts` |
| **Add ERPNext Accounting Methods** | `erpnext-custom-app/wellness_studio/api/` | Python whitelisted functions |
| **Add n8n Webhook Flows** | `automation-n8n/workflows/` | Workflow JSON definitions |
| **Sensitive Directories — DO NOT EDIT CASUALLY** | `shared/*`, `prisma/migrations/*`, `infrastructure/*` | Modifying migration history or shared packages breaks build pipelines. |

---

## 5. Prerequisites and Tooling Checklist

Before setting up the repository, ensure your development machine has the following tools installed:

| Tool | Required Version / Range | Why It Is Needed | How to Check Installation | Official Download Link |
|---|---|---|---|---|
| **Git** | `>= 2.40.0` (Active) | Source control management and submodule/branch checkout | `git --version` | [git-scm.com](https://git-scm.com/) |
| **Node.js** | `>= 20.0.0` (LTS recommended) | JavaScript runtime for Next.js, NestJS Gateway, and Worker | `node -v` | [nodejs.org](https://nodejs.org/) |
| **pnpm** | `12.6.0` (Exact workspace spec) | High-speed, symlink-based monorepo package manager | `pnpm -v` | [pnpm.io](https://pnpm.io/installation) |
| **Docker Desktop** | `>= 24.0.0` (Recommended) | Runs containerized PostgreSQL 16 (`pgvector`), Redis 7, and n8n | `docker --version` | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **PostgreSQL** | `16` with `pgvector` | Authoritative database engine with Row-Level Security support | `psql --version` | [postgresql.org](https://www.postgresql.org/download/) |
| **Redis** | `7.x` | Distributed in-memory sliding-window rate limiter & locks | `redis-cli --version` | [redis.io](https://redis.io/download/) |
| **Python** | `>= 3.10` | Only required if developing the custom Frappe app locally | `python --version` | [python.org](https://www.python.org/downloads/) |

### Special Setup Notes for Windows PowerShell Users
* If running on Windows, execute commands in **PowerShell 7+** or Windows Terminal (run as Administrator if permission errors occur).
* If `pnpm` is not installed globally, install it using npm or Corepack:
  ```powershell
  npm install -g pnpm@12.6.0
  # OR enable via Corepack:
  corepack enable
  corepack prepare pnpm@12.6.0 --activate
  ```
* If Docker is not installed or available on Windows, you can connect the application to an existing local or remote PostgreSQL 16 database and Redis server by configuring the connection strings in `.env`.

---

## 6. First-Time Setup from Clean Checkout

Follow these copyable, step-by-step instructions in sequence from a clean directory:

### Step 1: Clone the Repository
* **Working Directory:** Workspace parent directory (e.g. `C:\Projects` or `~/projects`)
* **Command:**
  ```powershell
  git clone https://github.com/thirumalaramakrishnagoud-cmd/fitness-ai.git
  cd fitness-ai
  ```
* **Expected Output:** `Cloning into 'fitness-ai'... done.`
* **Verification Command:** `git status`
* **What to Check if it Fails:** Verify your internet connectivity and ensure you have read access to the repository URL.

### Step 2: Verify Active Branch and Clean Working Tree
* **Working Directory:** `fitness-ai/` (Repository Root)
* **Command:**
  ```powershell
  git status --short
  git branch --show-current
  ```
* **Expected Output:**
  ```
  integration/all-features
  ```
* **Verification:** Ensure the branch is `integration/all-features`. If on a different branch, switch using:
  ```powershell
  git checkout integration/all-features
  ```
* **What to Check if it Fails:** Run `git fetch origin` to ensure all remote tracking branches are available.

### Step 3: Install Package Dependencies
* **Working Directory:** `fitness-ai/` (Repository Root)
* **Command:**
  ```powershell
  pnpm install
  ```
  *(Note: If `pnpm` is not in your PATH, run `npx pnpm@12.6.0 install`)*
* **Expected Output:** `Packages are hard linked... Done in Xs.`
* **Verification Command:** `node -e "console.log(require('@prisma/client'))"` (checks module resolution)
* **What to Check if it Fails:** Ensure Node.js version is `>=20.0.0` (`node -v`). Clear pnpm cache using `pnpm store prune` if corrupted.

### Step 4: Initialize Local Environment Configuration Files
* **Working Directory:** `fitness-ai/` (Repository Root)
* **Command:**
  ```powershell
  # Copy template environment files safely (never overwrite existing customized files)
  if (!(Test-Path .env)) { Copy-Item .env.example .env }
  if (!(Test-Path backend-nestjs-gateway/.env)) { Copy-Item backend-nestjs-gateway/.env.example backend-nestjs-gateway/.env }
  if (!(Test-Path backend-worker/.env)) { Copy-Item backend-worker/.env.example backend-worker/.env }
  if (!(Test-Path frontend-nextjs/.env)) { Copy-Item frontend-nextjs/.env.example frontend-nextjs/.env }
  ```
* **Expected Output:** New `.env` files created in the root, gateway, worker, and frontend directories.
* **Verification Command:** `Get-ChildItem -Filter '*.env*' -Recurse | Select-Object FullName`
* **Security Rule:** Never commit `.env` files containing real secrets to version control.

### Step 5: Start Infrastructure Containers
* **Working Directory:** `fitness-ai/` (Repository Root)
* **Command:**
  ```powershell
  # Start PostgreSQL 16 (Port 5432) and n8n (Port 5678)
  docker compose up -d postgres n8n

  # Start Redis 7 container (Port 6379)
  docker run -d --name fitness-ai-test-redis -p 6379:6379 redis:7-alpine
  ```
* **Expected Output:** Containers created and in `Up (healthy)` status.
* **Verification Command:**
  ```powershell
  docker ps
  ```
* **What to Check if it Fails:**
  - If Port 5432 is already occupied by a local PostgreSQL service, stop the local service or change the mapped port in `docker-compose.yml` to `5434:5432`.
  - If Port 6379 is occupied, verify existing Redis using `redis-cli ping`.

### Step 6: Generate Prisma Client and Apply Database Migrations
* **Working Directory:** `fitness-ai/backend-nestjs-gateway/`
* **Command:**
  ```powershell
  cd backend-nestjs-gateway
  npx prisma generate
  npx prisma migrate deploy
  cd ..
  ```
* **Expected Output:**
  ```
  Prisma schema loaded from prisma\schema.prisma
  Datasource "db": PostgreSQL database
  19 migrations found in prisma/migrations
  All migrations have been successfully applied.
  ```
* **Verification Command:**
  ```powershell
  cd backend-nestjs-gateway
  npx prisma migrate status
  cd ..
  ```
* **What to Check if it Fails:**
  - Verify PostgreSQL connectivity: `DATABASE_URL` in `backend-nestjs-gateway/.env` must match your running Postgres credentials (e.g., `postgresql://wsos:wsos_local@localhost:5432/wsos`).
  - Never run `prisma migrate reset` on production or shared databases as it drops all schemas.

### Step 7: Start Development Services
Open three separate terminal windows to launch the services in order:

* **Terminal 1: Start API Gateway (Port 3001)**
  ```powershell
  cd backend-nestjs-gateway
  npm run dev
  ```
  *Expected Output:* `[NestApplication] Nest application successfully started on port 3001`

* **Terminal 2: Start Background Worker (Port 3002)**
  ```powershell
  cd backend-worker
  npm run dev
  ```
  *Expected Output:* `Worker health endpoint listening on port 3002`

* **Terminal 3: Start Frontend Client (Port 3000)**
  ```powershell
  cd frontend-nextjs
  npm run dev
  ```
  *Expected Output:* `Ready in Xms (http://localhost:3000)`

### Step 8: Verify Service Health and Perform Smoke Test
* **Working Directory:** Any terminal
* **Command:**
  ```powershell
  # Check Gateway Health
  Invoke-RestMethod -Uri "http://localhost:3001/health"
  
  # Check Worker Health
  Invoke-RestMethod -Uri "http://localhost:3002/health"
  ```
* **Expected Output:**
  - Gateway: `{"status":"ok"}`
  - Worker: `{"status":"ok","service":"backend-worker"}`
* **Web Smoke Test:** Open your browser and navigate to:
  ```
  http://localhost:3000/enquiry
  ```
  Verify that the public enquiry page loads with the floating AI Enquiry Assistant widget in the bottom-right corner.

---

## 7. Environment Configuration Reference

The following table documents every environment variable consumed across the platform:

| Variable Name | Consuming Subsystems | Purpose & Validation Rules | Mandatory? | Default / Safe Local Value | Behavior When Missing |
|---|---|---|:---:|---|---|
| `DATABASE_URL` | Gateway, Worker | PostgreSQL connection string including user, pass, host, port, DB, and search path. | **Yes** (Dev & Prod) | `postgresql://wsos:wsos_local@localhost:5432/wsos` | App crashes immediately on bootstrap. |
| `TEST_DATABASE_URL` | Gateway Tests | Connection string for isolated RLS integration test database. | Test Only | `postgresql://postgres:postgres@localhost:5433/fitness_ai_ci_test` | Integration test suites skip or fail. |
| `NODE_ENV` | All Services | Runtime environment mode (`development`, `test`, `production`). | **Yes** | `development` | Defaults to `development`. |
| `PORT` | Gateway | HTTP listening port for the NestJS API Gateway. | Optional | `3001` (Dev) / `3000` (Docker) | Defaults to `3000` or `3001`. |
| `WORKER_HEALTH_PORT` | Worker | HTTP listening port for background worker `/health` endpoint. | Optional | `3002` | Defaults to `3002`. |
| `TRUST_PROXY_HOPS` | Gateway | Number of upstream reverse proxy hops to trust for IP resolution. | Prod Only | `1` (Integer `0` to `10`) | Crashes in production if missing or non-integer. |
| `CORS_ALLOWED_ORIGINS` | Gateway | Comma-separated list of whitelisted HTTPS origins. | Prod Only | `https://app.wellness-studio.com` | Rejects cross-origin requests; fails in prod. |
| `TENANT_BASE_DOMAIN` | Gateway, Frontend | Base domain used to resolve tenant subdomains from HTTP Host. | **Yes** | `fitness.local` | Fails tenant subdomain matching. |
| `JWT_SECRET` | Gateway | High-entropy secret key for signing member and staff auth JWTs. | Prod Only | Min 32 chars in production | Crashes in production if `< 32` characters. |
| `OTP_HASH_SECRET` | Gateway | Secret key for generating secure hashes of one-time login OTPs. | Prod Only | Min 32 chars in production | Crashes in production if `< 32` characters. |
| `REDIS_HOST` | Gateway, Worker | Hostname of the Redis cache server. | **Yes** | `localhost` | Defaults to `localhost`. |
| `REDIS_PORT` | Gateway, Worker | TCP port of the Redis cache server. | **Yes** | `6379` | Defaults to `6379`. |
| `REQUIRE_SHARED_RATE_LIMITER` | Gateway | When `true`, enforces that Redis MUST be available. | Prod Only | `false` in dev; `true` in prod | If `true` and Redis is down, fails closed with HTTP 503. |
| `CAPTCHA_SECRET_KEY` | Gateway | Secret key for verifying Cloudflare Turnstile CAPTCHA tokens. | Prod Only | `1x0000000000000000000000000000000AA` (Cloudflare test key) | In prod, fails closed with HTTP 403. |
| `CAPTCHA_VERIFY_URL` | Gateway | Upstream Cloudflare Turnstile token validation URL. | Prod Only | `https://challenges.cloudflare.com/turnstile/v0/siteverify` | Defaults to Cloudflare URL. |
| `REQUIRE_PRODUCTION_CAPTCHA` | Gateway | When `true`, rejects mock or client dev tokens (`cf_client_token_*`). | Prod Only | `false` in dev; `true` in prod | If `true`, development test tokens return HTTP 403. |
| `NEXT_PUBLIC_API_URL` | Frontend | Base URL of the API Gateway accessible from the browser. | **Yes** | `http://localhost:3001` (Dev) | In dev defaults to `http://localhost:3001`; in prod empty. |
| `NEXT_PUBLIC_TENANT_HOST` | Frontend | Tenant host header override for local client development. | Dev Only | `demo.fitness.local` | Client falls back to window hostname. |
| `LLM_PROVIDER` | Gateway, Worker | Active AI provider (`gemini` or `openai`). | **Yes** | `gemini` | Defaults to `gemini`. |
| `LLM_MODEL` | Gateway, Worker | Model name used for completions. | **Yes** | `gemini-2.5-flash` | Defaults to `gemini-2.5-flash`. |
| `LLM_API_KEY` | Gateway, Worker | API key for the selected AI provider. | Live AI | Real Google or OpenAI key | AI completions fail with HTTP 503 `AI_UNAVAILABLE`. |
| `N8N_WEBHOOK_URL` | Worker | URL for n8n notification webhook dispatcher. | Live Webhooks | `http://localhost:5678/webhook` | Worker logs error, retries, and moves to failed. |
| `OUTBOX_POLL_INTERVAL_MS`| Worker | Milliseconds between worker outbox polling cycles. | Optional | `5000` | Defaults to `5000` ms (5 seconds). |
| `OUTBOX_MAX_ATTEMPTS` | Worker | Max retry attempts before moving event to `dead` letter state. | Optional | `5` | Defaults to `5` attempts. |

---

## 8. Service Startup, Health Checks, and Shutdown

### 8.1 Startup Order and Health Check Table
Services must be started in strict dependency order:

| Startup Order | Service Name | Working Directory / Docker Service | Start Command | Port | Health Check Endpoint | Expected Result | Shutdown Command |
|:---:|---|---|---|:---:|---|---|---|
| **1** | **PostgreSQL 16** | Root | `docker compose up -d postgres` | `5432` | `docker exec -it fitness-ai-postgres-1 pg_isready -U wsos` | `accepting connections` | `docker compose stop postgres` |
| **2** | **Redis 7** | Root | `docker start fitness-ai-test-redis` | `6379` | `redis-cli -p 6379 ping` | `PONG` | `docker stop fitness-ai-test-redis` |
| **3** | **API Gateway** | `backend-nestjs-gateway/` | `npm run dev` | `3001` | `GET http://localhost:3001/health` | `{"status":"ok"}` | `Ctrl + C` |
| **4** | **Background Worker** | `backend-worker/` | `npm run dev` | `3002` | `GET http://localhost:3002/health` | `{"status":"ok","service":"backend-worker"}` | `Ctrl + C` |
| **5** | **Frontend Web** | `frontend-nextjs/` | `npm run dev` | `3000` | `GET http://localhost:3000/enquiry` | HTTP 200 OK HTML | `Ctrl + C` |
| **Optional** | **n8n Engine** | Root | `docker compose up -d n8n` | `5678` | `GET http://localhost:5678/healthz` | HTTP 200 OK | `docker compose stop n8n` |
| **Optional** | **Frappe ERP** | `erpnext-custom-app/` | `bench start` (Frappe Bench) | `8000` | `GET http://localhost:8000/api/method/ping` | `{"message":"pong"}` | `Ctrl + C` |

### 8.2 Full Stack vs. Reduced Local Development Stack
* **Full Production Stack**: Requires all 7 services running simultaneously (Postgres, Redis, Gateway, Worker, Frontend, Frappe ERP on Port 8000, and n8n on Port 5678).
* **Reduced Local Development Stack (Supported Today)**:
  - You only need **PostgreSQL (5432)**, **Redis (6379)**, **Gateway (3001)**, **Worker (3002)**, and **Frontend (3000)**.
  - In this reduced mode, ERP calls for events and schedules gracefully fall back to synthetic data, and outbox notification delivery safely backs off if n8n is unconfigured. All primary AI enquiry, lead capture, authentication, and database features function completely.

### 8.3 Operational Diagnostics: Port Ownership and Process Inspection
If a service fails to start because its port is occupied, use these non-destructive PowerShell commands:

```powershell
# 1. Identify which process owns a port (e.g., Port 3001)
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess, State

# 2. Get process name from Process ID (PID)
Get-Process -Id <OwningProcessId>

# 3. Gracefully stop a hung Node.js dev server by PID (Windows)
Stop-Process -Id <OwningProcessId>

# 4. Inspect Docker container status and logs
docker ps -a
docker logs --tail 50 fitness-ai-test-redis
docker compose logs --tail 50 postgres
```

---

## 9. End-to-End Application Workflows

### 9.1 Workflow 1: Public AI Enquiry & Approved FAQ Grounding
1. **User Action**: An anonymous prospect navigates to `http://localhost:3000/enquiry` and clicks the chat widget.
2. **Frontend Layer**: `PublicEnquiryChatWidget.tsx` requests a Turnstile CAPTCHA token and calls `POST /api/v1/public/ai/enquiry/sessions`.
3. **Gateway Ingress**: `PublicEnquiryAiController.createSession()` checks IP rate limits (max 5/hr/IP via Redis) and validates the CAPTCHA token.
4. **Session Persistence**: An enquiry session conversation row is created in `ai.conversations` with a 1-hour TTL. The gateway returns `201 Created` with a welcome greeting.
5. **Visitor Inquiry**: The visitor types: *"What are your operating hours?"*.
6. **FAQ Grounding**: `FaqKnowledgeService.searchApprovedFaqs()` executes a PostgreSQL full-text search against `config.faq_entries`:
   ```sql
   SELECT question, answer, ts_rank_cd(search_tsv, websearch_to_tsquery('english', $query))
   FROM config.faq_entries
   WHERE tenant_id = platform.current_tenant() AND status = 'approved'
   ORDER BY rank DESC LIMIT 3;
   ```
7. **Model Prompting**: The retrieved approved FAQs are injected into the LLM system prompt bounded by `<<<STUDIO_FAQ>>>` delimiters. The `visitor` principal is restricted to read-only tools.
8. **Response Delivery**: The AI returns a natural-language response citing studio hours, setting `source_refs: ["faq"]`. The message turns are stored in `ai.messages`.

### 9.2 Workflow 2: Prospective Lead Capture with Explicit Consent
1. **User Action**: The visitor expresses interest in joining (*"How much is the unlimited membership?"*).
2. **Intent Detection**: The gateway detects membership intent and returns `lead_capture_prompt: true`.
3. **Lead Form Submission**: The widget renders an inline lead capture card. The visitor enters their Name, Phone number, and checks the mandatory box: *"I agree to receive studio updates via WhatsApp"*.
4. **Gateway Validation**: The client submits `POST /api/v1/public/ai/enquiry/sessions/:id/lead`. The controller verifies `dto.consent.whatsapp === true`. If false, rejects with HTTP 422 `CONSENT_REQUIRED`.
5. **Transactional Dual-Write**:
   - The lead is inserted into CRM records with source `AI_ENQUIRY`.
   - An immutable audit log is written to `audit.audit_logs`.
   - An outbox event is created in `ops.outbox_events` (`lead.created`).
6. **Result**: The visitor sees: *"Thanks! A member of our team will reach out shortly."*

### 9.3 Workflow 3: Human Concierge Escalation via Asynchronous Outbox
1. **User Action**: The visitor types: *"I need to speak to someone about a private corporate workshop"*.
2. **Escalation Request**: The visitor clicks *"Talk to Concierge"* and enters their contact info. The frontend issues `POST /api/v1/public/ai/enquiry/sessions/:id/handoff`.
3. **Outbox Insertion**: The controller inserts an event into `ops.outbox_events`:
   - `event_type`: `'ai.enquiry.escalated'`
   - `status`: `'pending'`
   - `payload`: `{ handoffId: "handoff_...", sessionId: "...", reason: "...", contact: "+919876543210" }`
4. **Immediate Client Response**: The gateway returns HTTP `202 Accepted` with a confirmation ID. The visitor is not blocked waiting for notifications to deliver.
5. **Worker Polling Loop**: Within 5 seconds, `OutboxDispatcherService` in `backend-worker` polls eligible rows using:
   ```sql
   UPDATE ops.outbox_events SET status = 'dispatching', updated_at = NOW()
   WHERE id IN (
     SELECT id FROM ops.outbox_events
     WHERE status IN ('pending', 'failed') AND next_attempt_at <= NOW()
     ORDER BY created_at ASC LIMIT 100
     FOR UPDATE SKIP LOCKED
   ) RETURNING *;
   ```
6. **Safe Dispatching**: The worker masks the phone number in logs (`***3210`), formats the payload, and sends an HTTP POST request to the configured n8n webhook.
7. **Delivery Transition**:
   - If n8n returns `200 OK`, worker marks event `status = 'delivered'` and sets `delivered_at = NOW()`.
   - If n8n is unconfigured or unreachable, the worker throws an error, increments `attempts`, computes exponential backoff (`5s * 2^attempts`), and sets `status = 'failed'`. If attempts reach `maxAttempts` (5), it transitions to `'dead'`.

---

## 10. API, Database, and Integration Reference

### 10.1 Key API Routes and Contracts

#### 1. Initiate Public Chat Session
* **Endpoint:** `POST /api/v1/public/ai/enquiry/sessions`
* **Headers:** `Host: demo.fitness.local`, `Content-Type: application/json`
* **Request Payload:**
  ```json
  {
    "captcha_token": "cf_client_token_test_pass",
    "page_context": "/pricing"
  }
  ```
* **Success Response (HTTP 201 Created):**
  ```json
  {
    "session_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "greeting": "Hello! Welcome to Wellness Studio. How can I assist you with our classes, schedules, memberships, or upcoming events today?",
    "expires_at": "2026-10-17T16:30:00.000Z"
  }
  ```
* **Error Responses:** HTTP 403 `CAPTCHA_FAILED`, HTTP 429 `AI_RATE_LIMITED` (5 sessions/hr/IP).

#### 2. Send Message to AI Enquiry Assistant
* **Endpoint:** `POST /api/v1/public/ai/enquiry/sessions/:id/messages`
* **Request Payload:**
  ```json
  {
    "message": "What yoga classes are available tomorrow morning?"
  }
  ```
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "response": "We have Sunrise Vinyasa Yoga tomorrow at 7:00 AM with Instructor Sarah in Studio A. Would you like to know about our membership pricing or reserve a spot?",
    "source_refs": ["faq", "classes"],
    "lead_capture_prompt": true,
    "tool_calls": []
  }
  ```
* **Error Responses:** HTTP 404 `SESSION_NOT_FOUND`, HTTP 410 `SESSION_EXPIRED`, HTTP 429 (10 msg/min/session).

#### 3. Submit Prospect Lead
* **Endpoint:** `POST /api/v1/public/ai/enquiry/sessions/:id/lead`
* **Request Payload:**
  ```json
  {
    "name": "Jane Doe",
    "phone": "+919876543210",
    "email": "jane@example.com",
    "interest": "Morning Yoga",
    "consent": {
      "whatsapp": true
    }
  }
  ```
* **Success Response (HTTP 201 Created):**
  ```json
  {
    "lead_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "message": "Thanks! A member of our team will reach out shortly."
  }
  ```
* **Error Responses:** HTTP 422 `CONSENT_REQUIRED`, HTTP 429 (3 leads/hr/IP).

### 10.2 Major Database Schemas
The PostgreSQL database is organized into 7 functional schemas:

| Schema Name | Purpose & Contents | Primary Tables |
|---|---|---|
| `platform` | Multi-tenant core, tenant registry, and RLS helper procedures. | `tenants`, `subscriptions`, `system_settings` |
| `iam` | Identity and Access Management, users, credentials, roles, and MFA tokens. | `users`, `roles`, `permissions`, `user_roles`, `mfa_credentials` |
| `config` | Tenant-specific business configuration and approved FAQ knowledge base. | `faq_entries`, `studio_settings`, `branding_config` |
| `ops` | Transactional outbox events, webhook inboxes, and idempotency keys. | `outbox_events`, `idempotency_keys`, `webhook_inbox` |
| `audit` | Append-only, tamper-evident audit logs with PII redaction. | `audit_logs`, `security_events` |
| `ai` | AI conversation histories, turn messages, and pending action proposals. | `conversations`, `messages`, `pending_actions`, `copilot_sessions` |
| `crm` | Customer leads, pipeline stages, and member retention records. | `leads`, `pipeline_stages`, `campaigns`, `retention_actions` |

---

## 11. Testing and Quality Assurance Matrix

The following test suites have been verified against the active codebase:

| Test Suite Description | Test File Location | Execution Command | Dependencies | Tests Passed | Status & What It Proves |
|---|---|---|---|:---:|:---:|
| **Gateway AI Enquiry & Contract Suite** | `backend-nestjs-gateway/src/tests/ai-05-enquiry-assistant.spec.ts` | `npx jest src/tests/ai-05-enquiry-assistant.spec.ts --runInBand` | None (Unit/Mock) | **29 / 29** | Proves session lifecycle, Turnstile verification, FAQ grounding, rate limits, and lead consent logic. |
| **PostgreSQL RLS Integration Suite** | `backend-nestjs-gateway/src/tests/rls.integration.spec.ts` | `$env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/fitness_ai_ci_test"; npx jest src/tests/rls.integration.spec.ts` | Live Postgres 16 (:5433) | **24 / 24** | Proves kernel RLS isolation on `config.faq_entries`, cross-tenant blocking, and `tsvector` full-text search. |
| **Background Outbox Worker Suite** | `backend-worker/src/outbox-dispatcher/outbox-dispatcher.service.spec.ts` | `cd backend-worker; npm test` | None (Mock Sink) | **22 / 26** (4 skipped) | Proves `SKIP LOCKED` polling, exponential backoff, dead-letter transitions, and fail-closed outbox delivery. |
| **Frontend Web Contract Suite** | `frontend-nextjs/src/tests/real-data-integrity.spec.ts` & AI specs | `cd frontend-nextjs; npm test -- --runInBand` | None (DOM/Contract) | **63 / 63** (25 suites) | Proves chat widget rendering, route normalization, accessibility IDs, and absence of fake fallback success. |
| **Monorepo Lint & Whitespace Check** | Root | `git diff --check` | Git CLI | **Clean** | Proves zero trailing whitespace or carriage-return conflicts across all modified files. |

---

## 12. Troubleshooting and Incident Recovery Handbook

### 12.1 Common Startup and Runtime Issues

#### 1. PostgreSQL RLS Check Constraint Violation
* **Symptom:** Gateway or Worker throws: `new row for relation "outbox_events" violates check constraint "outbox_events_status_check"`.
* **Root Cause:** An unapproved status string was inserted (e.g. `'processing'` or `'sent'` instead of the schema-allowed `'pending'`, `'dispatching'`, `'delivered'`, `'failed'`, `'dead'`).
* **Safe Remedy:** Use the canonical Prisma/SQL status models defined in migration `040_ops`. Never alter database constraints directly in production.

#### 2. Redis Connection Refused / Rate Limiter Unavailable
* **Symptom:** Gateway returns HTTP 503 with body `{"error":{"code":"AI_UNAVAILABLE","message":"Shared rate limiter temporarily unavailable in production"}}`.
* **Root Cause:** `REQUIRE_SHARED_RATE_LIMITER=true` is set, but Redis is down on port 6379.
* **Diagnostic Command:** `redis-cli -p 6379 ping`
* **Safe Remedy:** Start the Redis container:
  ```powershell
  docker start fitness-ai-test-redis
  # Or create a new container if missing:
  docker run -d --name fitness-ai-test-redis -p 6379:6379 redis:7-alpine
  ```

#### 3. Port Conflict (Address Already in Use)
* **Symptom:** `Error: listen EADDRINUSE: address already in use :::3001` or `:::3000`.
* **Root Cause:** A previous Node.js process crashed or was left running in the background.
* **Diagnostic Command:**
  ```powershell
  Get-NetTCPConnection -LocalPort 3001 | Select-Object OwningProcess, State
  ```
* **Safe Remedy:** Terminate the hung process gracefully:
  ```powershell
  Stop-Process -Id <OwningProcessId>
  ```

#### 4. Prisma Client Out of Sync
* **Symptom:** `TypeError: this.prisma.conversation.create is not a function` or TypeScript compiler errors on schema fields.
* **Root Cause:** Schema changed or dependencies were updated without regenerating the compiled Prisma client.
* **Safe Remedy:**
  ```powershell
  cd backend-nestjs-gateway
  npx prisma generate
  cd ..
  ```

#### 5. Frappe ERP Connection Refused (Port 8000)
* **Symptom:** Gateway logs `ECONNREFUSED 127.0.0.1:8000` when invoking schedule or event tools.
* **Status:** Expected in local development without Frappe bench.
* **Safe Remedy:** The gateway tools automatically fall back to synthetic data in development mode. To connect a live instance, provision Frappe bench v15 and install `erpnext-custom-app`.

---

## 13. Current Implementation and Readiness Matrix

| Functional Module | Relevant Source Code Paths | Implementation Status | Verification Level | Known Limitations & Blockers |
|---|---|:---:|:---:|---|
| **Multi-Tenant RLS & Database** | `backend-nestjs-gateway/prisma/` | **IMPLEMENTED** | **LIVE VERIFIED** | 19 migrations applied; 24 RLS tests passed against live Postgres 16. |
| **Authentication & IAM** | `backend-nestjs-gateway/src/auth/` | **IMPLEMENTED** | **CONTRACT TESTED** | JWT, Argon2id, and MFA TOTP verified; Google OAuth requires client credentials. |
| **Distributed Rate Limiting** | `backend-nestjs-gateway/src/common/redis-client.ts` | **IMPLEMENTED** | **LIVE VERIFIED** | Sliding-window algorithm verified live against Redis 7 on port 6379. |
| **Public Chat Enquiry Widget** | `frontend-nextjs/src/features/ai/` | **IMPLEMENTED** | **CONTRACT TESTED** | 25 widget contract tests passed; embedded in public portal on `:3000`. |
| **Approved FAQ Grounding** | `backend-nestjs-gateway/src/ai/knowledge/` | **IMPLEMENTED** | **LIVE VERIFIED** | `search_tsv` PostgreSQL full-text search verified live; only approved FAQs returned. |
| **Turnstile Anti-Abuse** | `backend-nestjs-gateway/src/ai/public-enquiry-ai.controller.ts` | **IMPLEMENTED** | **LIVE PROVIDER** | Probed against live Cloudflare siteverify endpoint; prod secrets pending. |
| **Outbox Dispatcher Engine** | `backend-worker/src/outbox-dispatcher/` | **IMPLEMENTED** | **UNIT TESTED** | 22 tests passed; fail-closed delivery semantics, stale-claim recovery verified. |
| **Frappe / ERPNext Integration** | `erpnext-custom-app/`, `backend-nestjs-gateway/src/erpnext/` | **PARTIALLY IMPLEMENTED** | **BLOCKED** | Custom app contracts ready; Port 8000 offline in local dev (fallback mode active). |
| **n8n Automation Engine** | `automation-n8n/` | **PARTIALLY IMPLEMENTED** | **BLOCKED** | Workflow templates are 0-byte skeletons; Port 5678 offline in local dev. |
| **Production WhatsApp Messaging**| `automation-n8n/`, `backend-worker/` | **NOT VERIFIED** | **BLOCKED** | Real Meta WhatsApp Cloud API credentials unprovisioned; mock mode active. |

---

## 14. Deployment and Operational Handover

### 14.1 Production Container Profile
The repository includes a multi-container Docker deployment profile (`apps`) in `docker-compose.yml`:
* To build and run the entire application stack:
  ```powershell
  docker compose --profile apps up --build -d
  ```
* This launches:
  - `postgres`: PostgreSQL 16 with `pgvector` (Port 5432)
  - `n8n`: Automation workflow engine (Port 5678)
  - `api`: NestJS API Gateway (Port 3001)
  - `worker`: Background Outbox Worker (Port 3002)
  - `web`: Next.js 15 Client (Port 3000)

### 14.2 Production Readiness Checklist
Before promoting the platform to a live production environment, the platform engineering team must:
1. Provision a high-availability PostgreSQL 16 cluster with `pgvector` and automated point-in-time recovery (PITR) backups.
2. Provision a multi-node Redis cluster with persistent storage for distributed rate limiting.
3. Configure production Cloudflare Turnstile Site Key and Secret Key (`REQUIRE_PRODUCTION_CAPTCHA=true`).
4. Generate high-entropy 64-character secrets for `JWT_SECRET`, `OTP_HASH_SECRET`, and `FRAPPE_CALLBACK_SECRET`.
5. Deploy a live Frappe/ERPNext v15 bench instance on HTTPS and seed official membership pricing tiers.
6. Configure production Meta WhatsApp Cloud API access tokens inside n8n credential stores.
7. Configure Datadog / Prometheus monitoring alerts triggered whenever `ops.outbox_events` contains rows with `status = 'dead'`.

---

## 15. New Developer Onboarding Checklist

Print or copy this checklist to track your onboarding progress from a clean checkout to a verified running system:

- [ ] **1. Tooling Verification**
  - [ ] Node.js `>= 20.0.0` installed (`node -v`)
  - [ ] pnpm `12.6.0` installed (`pnpm -v` or `npx pnpm@12.6.0 -v`)
  - [ ] Git installed (`git --version`)
  - [ ] Docker Desktop running (`docker ps`)
- [ ] **2. Repository Setup**
  - [ ] Cloned repository and checked out branch `integration/all-features`
  - [ ] Confirmed working tree is clean (`git status`)
  - [ ] Installed workspace dependencies (`pnpm install`)
  - [ ] Initialized environment files (`.env` in root, gateway, worker, frontend)
- [ ] **3. Infrastructure Launch**
  - [ ] Started PostgreSQL container on Port 5432 (`docker compose up -d postgres`)
  - [ ] Started Redis container on Port 6379 (`docker run -d --name fitness-ai-test-redis -p 6379:6379 redis:7-alpine`)
  - [ ] Verified database readiness (`docker exec -it ... pg_isready -U wsos`)
- [ ] **4. Database Migration**
  - [ ] Generated Prisma client (`cd backend-nestjs-gateway; npx prisma generate`)
  - [ ] Applied all 19 database migrations (`npx prisma migrate deploy`)
- [ ] **5. Verification Testing**
  - [ ] Executed Gateway AI test suite (`npx jest src/tests/ai-05-enquiry-assistant.spec.ts`) $\to$ **29 Passed**
  - [ ] Executed Worker test suite (`cd ../backend-worker; npm test`) $\to$ **22 Passed**
  - [ ] Executed Frontend test suite (`cd ../frontend-nextjs; npm test`) $\to$ **63 Passed**
- [ ] **6. Application Execution**
  - [ ] Started API Gateway on Port 3001 (`cd backend-nestjs-gateway; npm run dev`)
  - [ ] Started Background Worker on Port 3002 (`cd backend-worker; npm run dev`)
  - [ ] Started Frontend Web on Port 3000 (`cd frontend-nextjs; npm run dev`)
  - [ ] Verified Gateway health endpoint (`GET http://localhost:3001/health`)
  - [ ] Verified Worker health endpoint (`GET http://localhost:3002/health`)
- [ ] **7. Smoke Test Completed**
  - [ ] Opened `http://localhost:3000/enquiry` in browser
  - [ ] Verified floating chat widget opens and answers sample question

---

## 16. References and Authoritative Documentation

This operational handbook is derived directly from the seven approved master project specifications:
1. **Master PRD**: `docs/Project-Documentions/Wellness_Studio_OS_Master_PRD.pdf`
2. **Solution Architecture Document**: `docs/Project-Documentions/Wellness Studio OS — Solution Architecture Document.pdf`
3. **Complete Module Specification**: `docs/Project-Documentions/Wellness_Studio_OS_Module_Specification.pdf`
4. **Database Design Document**: `docs/Project-Documentions/Wellness_Studio_OS_Database_Design_Document.pdf`
5. **API Contract & Integration Document**: `docs/Project-Documentions/Wellness_Studio_OS_API_Contract_Integration_Document.pdf`
6. **Execution and Delivery Plan**: `docs/Project-Documentions/Wellness_Studio_OS_Execution_Delivery_Plan.pdf`
7. **AI Agent Architecture Document**: `docs/Project-Documentions/Wellness_Studio_OS_AI_Agent_Architecture.pdf`

* **Companion AI Technical Handbook:**  
  See [AI_IMPLEMENTATION_WORKFLOW_COMPONENTS_01_02.md](AI_IMPLEMENTATION_WORKFLOW_COMPONENTS_01_02.md) for deep-dive AI platform architecture, tool registries, 5-minute presentation scripts, live demonstration steps, and technical Q&A.
