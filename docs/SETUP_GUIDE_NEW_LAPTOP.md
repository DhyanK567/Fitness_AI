# Fitness AI / Wellness Studio OS — Complete New-Laptop Setup Guide (Windows)

> **Document Type:** Operational Engineering Runbook & Developer Onboarding Guide<br>
> **Target OS:** Windows 10 / Windows 11 (64-bit)<br>
> **Repository:** `fitness-ai`<br>
> **Authoritative Branch:** `integration/all-features`<br>
> **Committed Baseline (HEAD):** `761f018`<br>
> **Classification:** Internal Engineering Runbook

---

## Table of Contents

1. [Project Overview and Architecture](#1-project-overview-and-architecture)
2. [Required Software and Compatible Versions for Windows](#2-required-software-and-compatible-versions-for-windows)
3. [Git Clone, Branch Checkout, and Repository Verification](#3-git-clone-branch-checkout-and-repository-verification)
4. [Environment-File Inventory and Safe Configuration Instructions](#4-environment-file-inventory-and-safe-configuration-instructions)
5. [Docker Installation, Compose Services, Images, Ports, Health Checks, and Persistent Volumes](#5-docker-installation-compose-services-images-ports-health-checks-and-persistent-volumes)
6. [PostgreSQL Configuration, Prisma Schema, Migration Order, and Database Procedures](#6-postgresql-configuration-prisma-schema-migration-order-and-database-procedures)
7. [Frontend, Backend Gateway, Background Worker, and Service Startup Instructions](#7-frontend-backend-gateway-background-worker-and-service-startup-instructions)
8. [Required External Integrations and Configuration Prerequisites](#8-required-external-integrations-and-configuration-prerequisites)
9. [Safe Commands for Running Tests, Type-Checking, Builds, and Health Checks](#9-safe-commands-for-running-tests-type-checking-builds-and-health-checks)
10. [Common Errors and Troubleshooting Steps](#10-common-errors-and-troubleshooting-steps)
11. [Secret Management and Security Precautions](#11-secret-management-and-security-precautions)
12. [Moving Real Data Safely Between Computers](#12-moving-real-data-safely-between-computers)
13. [Shutdown, Restart, Backup, and Recovery Procedures](#13-shutdown-restart-backup-and-recovery-procedures)
14. [Final New Developer Checklist](#14-final-new-developer-checklist)

---

## 1. Project Overview and Architecture

### 1.1 Purpose
**Fitness AI / Wellness Studio OS** is an enterprise-grade, multi-tenant software-as-a-service (SaaS) platform built for yoga studios, dance academies, pilates studios, gym chains, and cross-functional wellness facilities. The platform orchestrates lead acquisition, member memberships, class schedules, waitlist-backed bookings, real-time attendance, digital check-ins, automated billing, WhatsApp notifications, and an authoritative 12-agent artificial intelligence ecosystem.

### 1.2 System Architecture Diagram

```text
                               ┌──────────────────────────────────────────────┐
                               │       Next.js Web Client (Port 3000)         │
                               │   Staff B2B + Member B2C + Public Portals    │
                               │        AI Copilot & 12-Agent Studio Hub      │
                               └──────────────────────┬───────────────────────┘
                                                      │ HTTP / REST / JSON
                                                      │ Prefix: /api/v1
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │      NestJS API Gateway (Port 3001)          │
                               │    Modular Monolith & Security Perimeter     │
                               │  - Request Context (Tenant Host & Tracing)   │
                               │  - Auth (Argon2id, JWT, MFA, Google Auth)    │
                               │  - Multi-Tenant RLS Management               │
                               │  - 12 AI Agents & Tool Execution Engine      │
                               │  - Razorpay Webhook Ingestion (/webhooks)    │
                               └──────────┬──────────────────────┬────────────┘
                                          │                      │
                   ┌──────────────────────┴───────┐              │ ERP REST API
                   ▼                              ▼              ▼
     ┌───────────────────────────┐  ┌──────────────────────────┐ ┌──────────────────────┐
     │  PostgreSQL 16 + pgvector │  │      Redis 7 (6379)      │ │ Frappe / ERPNext v15 │
     │  Multi-Schema (Port 5432) │  │  - Distributed RateLimit │ │ - Business Truth     │
     │  - platform, iam, config  │  │  - Cron Lock Engine      │ │ - Financial Ledgers  │
     │  - ops, audit, ai         │  │  - Session Blacklist     │ │ - Custom App `ws_*`  │
     └─────────────┬─────────────┘  └──────────────────────────┘ └──────────────────────┘
                   │
                   ▼ (Polls ops.outbox)
     ┌───────────────────────────┐
     │     Background Worker     │
     │   (Health on Port 3002)   │
     │  - Outbox Dispatcher      │
     │  - Nightly Reconciliation │
     │  - Membership Expiry Cron │
     └─────────────┬─────────────┘
                   │ HMAC-Signed Webhook POST
                   ▼
     ┌───────────────────────────┐
     │      n8n Automation       │
     │   Workflow Engine (5678)  │
     │  - WhatsApp Mock / Live   │
     │  - Email Delivery Subflow │
     └───────────────────────────┘
```

### 1.3 Service Inventory and Classification

| Service / Component | Role / Directory | Execution Mode | Default Port | Status / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | Storage (`pgvector/pgvector:pg16`) | Containerized | `5432` | Required. Multi-schema (`platform`, `iam`, `config`, `ops`, `audit`, `ai`). |
| **Redis Cache** | Rate limiting / locks (`redis:7-alpine`) | Containerized | `6379` | Required. Enforces distributed login limits and scheduler locks. |
| **n8n Automation** | Workflow engine (`n8nio/n8n:latest`) | Containerized | `5678` | Required. Runs in mock mode (`WHATSAPP_MODE=mock`) in local development. |
| **Backend API Gateway** | `backend-nestjs-gateway` | Local Node.js | `3001` | Required. Modular monolith exposing REST API with `/api/v1` prefix. |
| **Background Worker** | `backend-worker` | Local Node.js | `3002` (health) | Required. Polls transactional outbox and dispatches async tasks. |
| **Frontend Web App** | `frontend-nextjs` | Local Node.js | `3000` | Required. Next.js 15 App Router (Staff B2B, Member B2C, Public). |
| **Shared Libraries** | `shared/*` (9 packages) | Monorepo internal | N/A | Required. Pre-compiled TypeScript workspace packages. |
| **ERPNext / Frappe** | `erpnext-custom-app` | Externally Hosted | `8000` | Optional for dev. Frappe Cloud or local site; gateway degrades gracefully when offline. |
| **LLM Gateway (Gemini)** | External API (`Google AI Studio`) | External API | HTTPS (443) | Required for AI. Compatible with `gemini-1.5-flash` or `gemini-1.5-pro`. |
| **Razorpay Gateway** | External API (`Razorpay Dashboard`) | External API | HTTPS (443) | Optional for local dev. Test mode credentials for subscription/billing webhooks. |

> [!IMPORTANT]
> **Container vs Local Execution:** In `docker-compose.yml`, the application containers under the `apps` profile (`api`, `worker`, `web`) reference Dockerfiles that are currently empty placeholders (0 bytes). **Do not attempt to build or run the application code inside Docker containers.** Local development runs `postgres`, `redis`, and `n8n` in Docker, while running the Node.js services directly on the host using `pnpm dev`.

---

## 2. Required Software and Compatible Versions for Windows

Before cloning or configuring the repository, ensure the following software is installed on the Windows laptop.

### 2.1 Software Prerequisites

1. **Operating System:**
   - Windows 10 64-bit (Version 22H2 or higher) or Windows 11 64-bit.
   - Windows Pro, Enterprise, or Education is recommended; Windows Home is fully supported using WSL2.

2. **Node.js (>= 20.0.0, Recommended: 24.x LTS):**
   - Verified engine constraint in root `package.json`: `"node": ">=20"`.
   - The `.nvmrc` file specifies version `24`.
   - **Recommended Windows Installer:** Use `nvm-windows` to easily manage Node.js versions:
     ```powershell
     # Using winget to install nvm-windows
     winget install CoreyButler.NVMforWindows
     # Open a new PowerShell terminal and install Node 24
     nvm install 24.0.0
     nvm use 24.0.0
     node --version  # Should output v24.x.x
     ```

3. **pnpm (Exact Version: 12.6.0):**
   - The repository strictly locks package management to `pnpm@12.6.0`.
   - Install globally via npm:
     ```powershell
     npm install -g pnpm@12.6.0
     pnpm --version  # Must output 12.6.0
     ```

4. **Git for Windows (>= 2.40.0):**
   - Install from [git-scm.com](https://git-scm.com/) or via winget:
     ```powershell
     winget install Git.Git
     ```
   - Configure line ending handling for Windows:
     ```powershell
     git config --global core.autocrlf false
     git config --global core.longpaths true
     ```

5. **Docker Desktop for Windows (>= 4.28.0):**
   - Install from [docker.com](https://www.docker.com/products/docker-desktop/).
   - Ensure the **WSL 2 backend** option is checked during installation.
   - Start Docker Desktop and verify:
     ```powershell
     docker --version
     docker compose version
     ```

6. **PowerShell Script Execution Policy:**
   - Windows blocks unsigned scripts by default. Open PowerShell and permit local scripts for your user account:
     ```powershell
     Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
     ```

### 2.2 Critical Windows-Specific Warning: OneDrive File Locks

> [!CAUTION]
> **NEVER CLONE THIS PROJECT INSIDE ONEDRIVE SYNCED DIRECTORIES**
>
> Cloning the repository into paths such as `C:\Users\<user>\OneDrive\Desktop\fitness-ai` or `C:\Users\<user>\OneDrive\Documents\` will cause catastrophic build failures. OneDrive continuously scans and locks thousands of small files inside `node_modules`, `.next`, and Prisma query engines (`.dll` / `.exe`), resulting in:
> - `EPERM: operation not permitted`
> - `EBUSY: resource busy or locked`
> - Prisma query engine generation crashes
>
> **Always place your development projects in a dedicated root directory**, for example:
> `C:\dev\fitness-ai` or `C:\projects\fitness-ai`.

---

## 3. Git Clone, Branch Checkout, and Repository Verification

### 3.1 Clone the Repository to a Safe Location

Open PowerShell and execute:

```powershell
# 1. Create a dedicated dev folder outside OneDrive
mkdir C:\dev
cd C:\dev

# 2. Clone the repository
git clone <YOUR_GIT_REPOSITORY_URL> fitness-ai
cd fitness-ai
```

### 3.2 Check Out the Integration Branch

The unified features, subscription infrastructure (Phase 1A), and webhook ingestion (Phase 1B) live on `integration/all-features`:

```powershell
# Checkout the authoritative integration branch
git checkout integration/all-features
```

### 3.3 Verify Git Status and Commit

Verify that you are on the expected branch and that your working tree is intact:

```powershell
# 1. Confirm current branch
git branch --show-current
# Expected output: integration/all-features

# 2. Inspect the latest commit hash
git rev-parse HEAD
# Expected baseline commit: 761f0186764a3475d64e687a790c4dfe897fdb12 (or newer on this branch)

# 3. Check working tree cleanliness
git status
```

---

## 4. Environment-File Inventory and Safe Configuration Instructions

The project requires four distinct `.env` files. Templates are provided via committed `.env.example` files. **Never commit actual `.env` files containing secrets to Git.**

### 4.1 Inventory of Environment Files

| Path | Template Source | Purpose / Scope | Consumed By |
| :--- | :--- | :--- | :--- |
| `.\.env` | `.\.env.example` | Root infrastructure configuration | Docker Compose (`postgres`, `n8n`) |
| `.\backend-nestjs-gateway\.env` | `.\backend-nestjs-gateway\.env.example` | API Gateway runtime & security | NestJS Gateway API |
| `.\backend-worker\.env` | `.\backend-worker\.env.example` | Background dispatcher & schedulers | NestJS Worker Process |
| `.\frontend-nextjs\.env.local` | `.\frontend-nextjs\.env.example` | Next.js client & SSR configuration | Next.js Frontend |

---

### 4.2 Configuration Instructions

#### 1. Root Docker Compose Environment (`.\.env`)

Copy the template:
```powershell
Copy-Item .env.example .env
```

Review and set safe development defaults inside `.\.env`:
```ini
# Root / compose. Copy to .env (never commit .env)
POSTGRES_USER=wsos
POSTGRES_PASSWORD=wsos_local_dev_secret
POSTGRES_DB=wsos
N8N_ENCRYPTION_KEY=local-dev-key-change-me-32chars
```

---

#### 2. Backend Gateway Environment (`.\backend-nestjs-gateway\.env`)

Copy the template:
```powershell
Copy-Item backend-nestjs-gateway\.env.example backend-nestjs-gateway\.env
```

Edit `backend-nestjs-gateway\.env` with development values:

```ini
NODE_ENV=development
# Port 3001 prevents port collision with Next.js frontend (which uses port 3000)
PORT=3001
TRUST_PROXY_HOPS=1
REQUEST_BODY_LIMIT=256kb
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://demo.fitness.local:3000
TENANT_BASE_DOMAIN=fitness.local

# Database Connection (connects to Postgres container on port 5432)
DATABASE_URL=postgresql://wsos:wsos_local_dev_secret@127.0.0.1:5432/wsos?schema=public

# Optional dedicated webhook ingestion user (falls back to DATABASE_URL in development)
# WEBHOOK_INGEST_DATABASE_URL=postgresql://ingest_user:secret@127.0.0.1:5432/wsos?schema=public

# Security Secrets (Use high-entropy random strings in production; placeholders for dev)
JWT_SECRET=super_secret_jwt_key_fitness_ai_development_minimum_32_chars
RAZORPAY_WEBHOOK_SECRET=rzp_webhook_secret_dev_testing

# ERPNext / Frappe (Leave default or point to your Frappe instance)
FRAPPE_BASE_URL=http://127.0.0.1:8000
FRAPPE_API_KEY=
FRAPPE_API_SECRET=
FRAPPE_CALLBACK_SECRET=
FRAPPE_TIMEOUT_MS=10000

# AI / LLM Configuration (Google Gemini)
LLM_PROVIDER=gemini
LLM_MODEL=gemini-1.5-flash
LLM_API_KEY=YOUR_GOOGLE_AI_STUDIO_API_KEY
```

> [!TIP]
> **Getting a Free Gemini API Key:** You can generate a free development API key from [Google AI Studio](https://aistudio.google.com/apikey).

---

#### 3. Backend Worker Environment (`.\backend-worker\.env`)

Copy the template:
```powershell
Copy-Item backend-worker\.env.example backend-worker\.env
```

Edit `backend-worker\.env`:

```ini
NODE_ENV=development
DATABASE_URL=postgresql://wsos:wsos_local_dev_secret@localhost:5432/wsos
N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook
HMAC_SECRET_N8N=local_dev_hmac_secret_fitness_worker
OUTBOX_POLL_INTERVAL_MS=2000
OUTBOX_MAX_RETRIES=5
WORKER_HEALTH_PORT=3002

LLM_PROVIDER=gemini
LLM_API_KEY=YOUR_GOOGLE_AI_STUDIO_API_KEY
```

---

#### 4. Frontend Environment (`.\frontend-nextjs\.env.local`)

Create or update `frontend-nextjs\.env.local`:

```ini
NODE_ENV=development
# Points to the NestJS Gateway API on port 3001
NEXT_PUBLIC_API_URL=http://localhost:3001
# Optional: Set default tenant hostname for multi-tenant simulation
NEXT_PUBLIC_TENANT_HOST=demo.fitness.local
API_TENANT_HOST=demo.fitness.local
```

---

## 5. Docker Installation, Compose Services, Images, Ports, Health Checks, and Persistent Volumes

### 5.1 Docker Compose Services (`docker-compose.yml`)

The repository includes a root `docker-compose.yml` pre-configured for local infrastructure:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-wsos}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-wsos_local}
      POSTGRES_DB: ${POSTGRES_DB:-wsos}
    ports: [ "5432:5432" ]
    volumes: [ pgdata:/var/lib/postgresql/data ]
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-wsos}" ]
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: [ "6379:6379" ]
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 5s
      timeout: 3s
      retries: 10

  n8n:
    image: n8nio/n8n:latest
    environment:
      N8N_HOST: localhost
      N8N_PORT: 5678
      MOCK_MODE: "true"
      WHATSAPP_MOCK_MODE: "true"
      WHATSAPP_MODE: "mock"
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY:-local-dev-key-change-me}
      WEBHOOK_URL: http://localhost:5678/
      GENERIC_TIMEZONE: Asia/Kolkata
    ports: [ "5678:5678" ]
    volumes: [ n8ndata:/home/node/.n8n ]

volumes:
  pgdata:
  n8ndata:
```

### 5.2 Starting Infrastructure Containers

From the repository root, start only the infrastructure services in detached mode:

```powershell
docker compose up -d postgres redis n8n
```

### 5.3 Verifying Service Health

Check that all three containers are running and healthy:

```powershell
docker compose ps
```

Expected output:
```text
NAME                 IMAGE                     COMMAND                  SERVICE      STATUS                    PORTS
fitness-ai-n8n-1      n8nio/n8n:latest          "tini -- /docker-ent…"   n8n          Up (healthy)              0.0.0.0:5678->5678/tcp
fitness-ai-postgres-1 pgvector/pgvector:pg16    "docker-entrypoint.s…"   postgres     Up (healthy)              0.0.0.0:5432->5432/tcp
fitness-ai-redis-1    redis:7-alpine            "docker-entrypoint.s…"   redis        Up (healthy)              0.0.0.0:6379->6379/tcp
```

### 5.4 Inspecting Container Logs
If any container fails to reach healthy status:
```powershell
# Check Postgres logs
docker compose logs postgres
# Check Redis logs
docker compose logs redis
# Check n8n logs
docker compose logs n8n
```

---

## 6. PostgreSQL Configuration, Prisma Schema, Migration Order, and Database Procedures

### 6.1 Multi-Schema Database Architecture

The application requires PostgreSQL 16 with the `pgvector`, `pgcrypto`, and `citext` extensions. The single application database (`wsos`) is partitioned into 6 distinct schemas:
1. `platform`: Tenants, subscription tiers, tier features, provider plan mappings, tenant subscriptions, studios, branches, and domains.
2. `iam`: Users, credentials (Argon2id), roles, permission grants, sessions, TOTP MFA secrets, and auth action tokens.
3. `config`: Studio business rules, opening hours, booking policies, and notification rules.
4. `ops`: Transactional outbox events, idempotency keys, and payment/webhook inboxes.
5. `audit`: Append-only audit logs, user security events, and AI tool execution logs.
6. `ai`: AI conversation sessions, chat messages, pending confirmation actions, and RAG vector embeddings.

### 6.2 Generating the Prisma Client

The Prisma schema is located at `backend-nestjs-gateway/prisma/schema.prisma`. Generate the client using pnpm:

```powershell
pnpm --filter @fitness-ai/backend-nestjs-gateway prisma generate
```

### 6.3 Database Migrations Sequence and Committed Baseline

Migrations are located in `backend-nestjs-gateway/prisma/migrations/`. They must execute in strict numerical order.

> [!IMPORTANT]
> **Committed Baseline Boundary:** The authoritative, committed migration baseline on `integration/all-features` (HEAD `761f018`) concludes at **`130_platform_subscription_infrastructure`**.
>
> Do NOT execute or deploy uncommitted migration folders (such as `131_owner_registration_and_verification` drafts) in a fresh setup. Only committed, peer-reviewed migrations form the deployable baseline.

The committed migration sequence:
- `000_bootstrap` — Schemas, RLS procedures, extensions
- `010_platform` — Tenants and branches
- `020_iam` — IAM users, roles, and credentials
- `030_config` — Tenant configuration
- `040_ops` — Outbox and idempotency
- `050_audit` — Append-only audit records
- `060_webhook_claim_states` through `066_nullable_security_event_tenant` — Auth hardening, distributed rate limiting, and security events
- `070_ai` through `090_crm_retention` — AI tables, vector knowledge base, CRM retention
- `100_auth_hardening` through `120_faq_entries` — Encryption, RLS, and FAQ catalogs
- `130_platform_subscription_infrastructure` — SaaS subscription plans, invoices, and least-privilege runtime roles

#### Applying Migrations on a Fresh Database:
Ensure your Postgres container is running, then execute:

```powershell
cd backend-nestjs-gateway
npx prisma migrate deploy
cd ..
```

---

### 6.4 Initial Database State (Pristine Schema vs Optional Demo Seeding)

> [!IMPORTANT]
> **Initial Setup Principle: No Dummy Business Data, No Additional Databases**
>
> The standard setup creates **no additional database** beyond the single configured database (`wsos`), and seeds **zero synthetic business data**.
>
> After running `npx prisma migrate deploy`, the database contains:
> - All 6 schemas (`platform`, `iam`, `config`, `ops`, `audit`, `ai`)
> - All system tables, functions, triggers, and least-privilege roles
> - Baseline platform catalogs (e.g. Starter, Growth, Enterprise subscription tiers from migration 130)
> - **Zero business tenants, zero dummy members, and zero synthetic bookings.**
>
> This leaves the system clean and ready to connect to real data or begin fresh tenant onboarding.

#### Optional Development Seeding (Non-Production Sandbox Only)
If and only if you are exploring the application UI locally without real data, you may optionally seed a demo tenant (`demo.fitness.local`) and owner account:

```powershell
# OPTIONAL: Run only on a local scratch database for mock UI exploration
pnpm --filter @fitness-ai/backend-nestjs-gateway exec tsx prisma/seeds/demo-tenant.seed.ts
```
*(Do NOT run this seed script if you plan to restore or connect to real studio data).*

---

### 6.5 Safe Database Backup and Restore Procedures

#### Taking a Safe Database Dump (Export)
Always back up directly from the container to a compressed custom-format binary dump (`.dump`):

```powershell
# Create backups directory if not exists
New-Item -ItemType Directory -Force -Path C:\backups

# Export full database with schemas and vector embeddings
docker compose exec -T postgres pg_dump -U wsos -d wsos -Fc > C:\backups\fitness_ai_backup_$(Get-Date -Format "yyyyMMdd_HHmmss").dump
```

---

#### Connecting to an Existing Database Without Restoring
If you already possess a running PostgreSQL instance or a hosted database containing real data:
1. Update `DATABASE_URL` in `backend-nestjs-gateway\.env` and `backend-worker\.env` to point to that database.
2. **Do NOT run `npx prisma migrate deploy` or any restore command against an existing populated database.**
3. Verify connection readiness:
   ```powershell
   docker compose exec postgres pg_isready -U wsos -d wsos
   ```

---

#### Non-Destructive Restoration: Isolated Target Database Pattern
When testing a backup dump, **never restore directly over your working database**. Restore into a dedicated, isolated target database first to verify its contents:

```powershell
# 1. Create a separate, isolated verification database (e.g. wsos_verify_target)
docker compose exec postgres createdb -U wsos wsos_verify_target

# 2. Restore into the isolated target database (non-destructive to existing 'wsos')
Get-Content C:\backups\fitness_ai_backup_<TIMESTAMP>.dump -Raw | docker compose exec -T postgres pg_restore -U wsos -d wsos_verify_target -v

# 3. Verify schemas and row counts in the isolated target
docker compose exec postgres psql -U wsos -d wsos_verify_target -c "\dt platform.*"

# 4. Only after verification, switch DATABASE_URL in .env to the verified database if intended
```

---

#### Destructive Restoration Over Local Scratch Database

> [!CAUTION]
> **DESTRUCTIVE RESTORATION WARNING — PERMANENT DATA LOSS**
>
> Running `pg_restore` with the `--clean` flag drops all existing tables and views in the target database before recreating them. Any unbacked data in the target database will be permanently destroyed.
>
> **Explicit Target Selection Required:** Confirm that the target database is strictly your local scratch database before proceeding:

```powershell
# CAUTION: Permanently overwrites ALL objects in the target database!
# Target: wsos (Local scratch database)
Get-Content C:\backups\fitness_ai_backup_<TIMESTAMP>.dump -Raw | docker compose exec -T postgres pg_restore -U wsos -d wsos --clean --if-exists -v
```

---

## 7. Frontend, Backend Gateway, Background Worker, and Service Startup Instructions

### 7.1 Monorepo Dependency Installation & `allowBuilds`

Modern pnpm (v10+) enforces security controls (`allowBuilds`) on packages with native build scripts (`@prisma/client`, `@prisma/engines`, `@node-rs/argon2`, `esbuild`).

Run the following installation sequence from the repository root:

```powershell
# 1. Initial install run
pnpm install

# 2. Approve necessary native builds (configured in pnpm-workspace.yaml)
pnpm approve-builds

# 3. Finalize workspace dependencies
pnpm install
```

Verify that all 11 workspace packages are recognized:
```powershell
pnpm -r list --depth -1
```

---

### 7.2 Service Startup (Development Mode)

We strongly recommend launching each application service in a dedicated terminal window so logs, health statuses, and errors are cleanly separated.

#### Terminal 1: Infrastructure
```powershell
cd C:\dev\fitness-ai
docker compose up -d postgres redis n8n
```

#### Terminal 2: Backend API Gateway
```powershell
cd C:\dev\fitness-ai\backend-nestjs-gateway
pnpm dev
```
- Listens on: `http://localhost:3001`
- Global API Prefix: `http://localhost:3001/api/v1`
- Liveness Probe: `http://localhost:3001/api/v1/health/live`
- Readiness Probe: `http://localhost:3001/api/v1/health/ready`

#### Terminal 3: Background Worker
```powershell
cd C:\dev\fitness-ai\backend-worker
pnpm dev
```
- Worker Health Check: `http://localhost:3002/health`
- Logs will show `[OutboxDispatcherService]` polling and scheduler registrations.

#### Terminal 4: Frontend Web Application
```powershell
cd C:\dev\fitness-ai\frontend-nextjs
pnpm dev
```
- Available in browser: `http://localhost:3000`
- Member Login: `http://localhost:3000/member-login`
- Staff Login: `http://localhost:3000/staff-login`
- AI Copilot: `http://localhost:3000/admin/ai-assistant`
- AI 12-Agent Hub: `http://localhost:3000/admin/ai`

---

## 8. Required External Integrations and Configuration Prerequisites

### 8.1 ERPNext / Frappe (System of Record)
- **Role:** ERPNext is the authoritative system of record for accounting, invoices, classes, attendance records, and trainer allocations.
- **Custom App:** `erpnext-custom-app` contains Frappe DocTypes prefixed with `ws_` (`ws_member`, `ws_booking`, `ws_attendance`, etc.).
- **Development Fallback:** When Frappe is offline, the API Gateway degrades gracefully: read endpoints provide preview structures, and health endpoints report `status: "degraded"` rather than crashing.

### 8.2 Google Gemini AI (Studio Copilot & 12 Agents)
- **Role:** Powers natural language queries, tool-assisted action proposals (e.g., creating members, booking classes, issuing refunds), customer enquiry bots, and sentiment analytics.
- **Provider:** Set `LLM_PROVIDER=gemini` and `LLM_MODEL=gemini-1.5-flash` in `backend-nestjs-gateway\.env`.
- **API Key:** Obtain a key from [Google AI Studio](https://aistudio.google.com/apikey).

### 8.3 Razorpay (Subscription & Payment Processing)
- **Role:** Handles payment links, recurring mandates, and subscription events.
- **Inbound Webhook Endpoint:** `POST /api/v1/webhooks/razorpay` (exempt from tenant host resolution).
- **Security:** Verifies `X-Razorpay-Signature` HMAC SHA-256 against raw body before storing in `platform.platform_webhook_inbox`.
- **Development Testing:** Use Razorpay Test Key and Secret from your Razorpay Dashboard.

### 8.4 n8n Automation Engine & WhatsApp Cloud API
- **Role:** Delivers outbound transactional messages (booking confirmations, class reminder alerts, renewal prompts).
- **Default Dev Mode:** `WHATSAPP_MODE=mock`. Outbox events are routed through n8n and marked as simulated deliveries without calling external Meta APIs.
- **Workflow Placeholders:** Files in `automation-n8n/workflows/` are empty placeholders; the engine relies on imported workflows or mock dispatcher modes.
- **Production Mode:** Requires WhatsApp Cloud API credentials configured in n8n UI under `Credentials -> whatsapp-cloud-api`.

---

## 9. Safe Commands for Running Tests, Type-Checking, Builds, and Health Checks

The following commands are **non-destructive, read-only, and safe to execute** at any time. None of these commands drop databases, delete data, or modify existing source files.

### 9.1 Verification Commands Table

| Target | Command | Verification Purpose | Actual Execution Status |
| :--- | :--- | :--- | :--- |
| **Frontend Tests** | `pnpm --filter @fitness-ai/frontend-nextjs test` | Runs 74 unit, contract, and AI tests via `tsx --test` | **Verified: Passed (74/74 tests, 30 suites in 356ms)** |
| **Frontend Typecheck** | `pnpm --filter @fitness-ai/frontend-nextjs typecheck` | Validates TypeScript with `tsc --noEmit` | **Verified: Passed (0 errors)** |
| **Gateway Typecheck** | `pnpm --filter @fitness-ai/backend-nestjs-gateway typecheck` | Prisma generation and TypeScript compilation | **Verified: Passed (0 errors)** |
| **Worker Typecheck** | `pnpm --filter @fitness-ai/backend-worker typecheck` | Validates worker TypeScript with `tsc --noEmit` | **Verified: Passed (0 errors)** |
| **Worker Tests** | `pnpm --filter @fitness-ai/backend-worker test` | Outbox dispatcher & scheduler Jest tests | **Verified: Passed (26/26 tests, 2 suites skipped)** |
| **Monorepo Typecheck** | `pnpm typecheck` | Turborepo-wide type checking across all packages | **Verified: Passed (7/7 tasks successful in 7.668s)** |
| **Forbidden File Path Check** | `git ls-files \| Select-String -Pattern "(\.env$\|\.dump$\|\.bak$\|node_modules/)"` | Checks tracked file names and paths for sensitive extensions | **Verified: Passed (0 matches found)** |
| **Tracked Content Secret Scan** | `git grep -I -l -E "<PATTERNS>" -- ":!*.example" ":!*.template" ":!*.lock" ":!pnpm-lock.yaml" ":!docs/SETUP_GUIDE_NEW_LAPTOP.md"` | Scans tracked file contents for high-entropy keys without printing secrets | **Verified: Passed (0 matches found, exit code 1)** |
| **Untracked Content Secret Scan** | `git ls-files --others --exclude-standard \| ForEach-Object { git grep --no-index -I -l -E "<PATTERNS>" -- $_ }` | Scans untracked working files safely without printing secret text | **Verified: Passed (0 matches found)** |

---

### 9.2 Running Live Health Checks

Once services are running, verify their endpoints via PowerShell:

```powershell
# 1. Gateway Liveness (should return 200 OK)
Invoke-RestMethod -Uri "http://localhost:3001/api/v1/health/live"

# 2. Gateway Readiness (verifies DB, Redis, and dependencies)
Invoke-RestMethod -Uri "http://localhost:3001/api/v1/health/ready"

# 3. Worker Health
Invoke-RestMethod -Uri "http://localhost:3002/health"
```

---

## 10. Common Errors and Troubleshooting Steps

### 10.1 Port 5432 Collision (PostgreSQL)
- **Symptom:** `docker compose up` fails with: `Bind for 0.0.0.0:5432 failed: port is already allocated`.
- **Root Cause:** A local PostgreSQL installation on Windows is running as a background Windows service.
- **Fix:**
  ```powershell
  # Stop the Windows service
  Stop-Service -Name "postgresql*"
  # Or configure docker-compose.yml to expose "5433:5432" and update DATABASE_URL
  ```

### 10.2 Port 3000 Collision (Next.js vs NestJS)
- **Symptom:** Gateway or Next.js crashes on startup saying `EADDRINUSE :::3000`.
- **Root Cause:** Both services attempt to bind to default port 3000.
- **Fix:** Ensure `PORT=3001` is explicitly set in `backend-nestjs-gateway\.env`. Next.js will use port 3000, and Gateway will use port 3001.

### 10.3 OneDrive EPERM / Resource Locked Error
- **Symptom:** `EPERM: operation not permitted, rename ...` or `EBUSY: resource busy or locked`.
- **Root Cause:** Repository is located inside a OneDrive synced folder (`Desktop`, `Documents`).
- **Fix:** Move repository to `C:\dev\fitness-ai` and delete `node_modules` and `.pnpm-store` before running `pnpm install`.

### 10.4 pnpm `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` / Build Blocked
- **Symptom:** pnpm refuses to build `@prisma/client` or `@node-rs/argon2`.
- **Root Cause:** pnpm v10+ requires explicit authorization for packages that execute arbitrary lifecycle scripts.
- **Fix:** Run `pnpm approve-builds` from the repository root, select the packages, and run `pnpm install` again.

### 10.5 PowerShell Script Execution Blocked
- **Symptom:** `File ... cannot be loaded because running scripts is disabled on this system`.
- **Fix:** Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` in PowerShell.

### 10.6 WSL 2 High RAM Consumption
- **Symptom:** Docker Desktop consumes 90%+ of laptop memory.
- **Fix:** Create a `.wslconfig` file in your Windows user directory (`C:\Users\<user>\.wslconfig`):
  ```ini
  [wsl2]
  memory=6GB
  processors=4
  swap=2GB
  ```
  Then restart WSL via PowerShell: `wsl --shutdown`.

---

## 11. Secret Management and Security Precautions

### 11.1 Secret Cleanliness Rules
1. **Never Commit `.env` Files:** Only committed `.env.example` templates may exist in Git.
2. **Never Commit Database Dumps:** File patterns `.dump`, `.bak`, and `.sql` are strictly ignored by `.gitignore`.

---

### 11.2 Safe, Non-Leaking Secret Auditing on Windows

A proper secret audit requires two distinct checks:
1. **File Name & Path Check:** Verifying that sensitive files (`.env`, `.dump`, `.bak`, `node_modules/`) are not tracked in Git.
2. **File Content Scan:** Scanning source files for credential patterns (e.g. AWS keys, private keys, API tokens).

> [!IMPORTANT]
> **Safe Scanning Principle — Suppress Matching Content:**
> When scanning for secrets, never print matching lines into terminal windows, logs, or CI artifacts. Printing matched lines exposes the actual secret in the console output! Always use flags that report only filenames (`-l` / `--files-with-matches`), suppressing the secret text.

#### Step A: Verify No Sensitive File Paths Are Tracked (File Name Check)
Run this native PowerShell command:
```powershell
# Checks tracked file names and paths in Git
git ls-files | Select-String -Pattern '(^|[\\/])\.env$|\.(dump|bak)$|(^|[\\/])node_modules\/'
# Expected output: (Empty / no output). If any file is returned, unstage/remove it from Git immediately.
```

#### Step B: Scan Tracked File Contents for Credentials (Safe Content Scan)
Use `git grep` with `-l` (files-with-matches only):
```powershell
# Patterns matching high-entropy credential formats
$patterns = 'AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY-----|sk-[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{35}|rzp_(live|test)_[A-Za-z0-9]{10,}|xox[baprs]-[A-Za-z0-9-]{10,}'

# Scans tracked repository contents without printing secret values
git grep -I -l -E "$patterns" -- ":!*.example" ":!*.template" ":!*.lock" ":!pnpm-lock.yaml" ":!docs/SETUP_GUIDE_NEW_LAPTOP.md"
# Expected output: (Empty / exit code 1).
```

#### Step C: Scan Untracked Working Files for Credentials (Safe Untracked Scan)
To verify uncommitted files before staging:
```powershell
# Scans non-ignored untracked files safely without printing matched text
git ls-files --others --exclude-standard | ForEach-Object { git grep --no-index -I -l -E "$patterns" -- $_ }
# Expected output: (Empty / no output).
```

> [!NOTE]
> **Unix Script Compatibility Note (`scripts/check-secrets.sh`):**
> The committed helper script `scripts/check-secrets.sh` is a Unix shell script with LF line endings and relies on GNU `xargs -d '\n'`. Running it directly under Windows Git Bash can fail with bash syntax errors (`set: -: invalid option` and `$'\r': command not found`) due to Windows CRLF line endings. On Windows, use the native PowerShell and `git grep` commands documented above, or run `check-secrets.sh` inside WSL.

---

### 11.3 Database Least Privilege (Phase 1A Architecture)
The platform defines three dedicated runtime roles in `130_platform_subscription_infrastructure`:
- `fitness_app_runtime`: Used by NestJS Gateway for tenant-scoped CRUD. Has column-level restrictions (cannot alter `tier_id` directly) and executes secure stored procedures (`bind_tenant_subscription_mandate`, `verify_owner_email`).
- `fitness_webhook_ingest`: Used strictly by the Razorpay webhook endpoint (`WEBHOOK_INGEST_DATABASE_URL`). It is **INSERT-only** on `platform.platform_webhook_inbox` and cannot read or write any business tables.
- `fitness_worker_runtime`: Used by `backend-worker` to claim outbox records and execute `reconcile_subscription_provider_state`.

---

## 12. Moving Real Data Safely Between Computers

When transferring the project to a new laptop, **never use Git to transfer databases or production state**. Git is strictly for source code versioning.

### 12.1 What Goes via Git vs What Stays Local

| Asset | Transfer Medium | Destination on New Laptop |
| :--- | :--- | :--- |
| **Application Source Code** | Git (`git clone / pull`) | `C:\dev\fitness-ai` |
| **Configuration Files** | Git (committed files) | Workspace root |
| **Environment Variables (`.env`)** | Encrypted Password Vault | Recreated manually per service |
| **PostgreSQL Database Data** | `pg_dump` encrypted file | Restored via `pg_restore` into verified target |
| **Docker Named Volumes (`pgdata`, `n8ndata`)** | Recreated locally on Docker | Created automatically on `docker compose up` |

### 12.2 Step-by-Step Data Migration Procedure

#### Step 1: Export Database on Source Computer
On your existing laptop, export the database into a custom-format binary dump:
```powershell
docker compose exec -T postgres pg_dump -U wsos -d wsos -Fc > C:\backups\fitness_ai_production_state.dump
```

#### Step 2: Encrypt and Transfer the Dump File
Encrypt the `.dump` file (e.g. using 7-Zip AES-256 or BitLocker-encrypted external drive) and transfer it to the new laptop. **Do not upload raw database dumps to public cloud buckets or chat apps.**

#### Step 3: Transfer Secrets Securely
Export the `.env` values from your password manager (e.g., 1Password, Bitwarden) and paste them into the respective `.env` files on the new laptop.

#### Step 4: Import Database into Verified Target on New Computer
On the new laptop:
1. Ensure the PostgreSQL container is running: `docker compose up -d postgres`
2. First restore into an isolated verification database:
   ```powershell
   docker compose exec postgres createdb -U wsos wsos_verified
   Get-Content C:\backups\fitness_ai_production_state.dump -Raw | docker compose exec -T postgres pg_restore -U wsos -d wsos_verified -v
   ```
3. Update `DATABASE_URL` in `.env` to point to `wsos_verified`.

---

## 13. Shutdown, Restart, Backup, and Recovery Procedures

### 13.1 Graceful Daily Shutdown and Volume Preservation
1. Stop the application services in their terminals: Press `Ctrl + C` in the terminals running Frontend, Gateway, and Worker.
2. Stop the Docker containers safely:
   ```powershell
   docker compose stop
   ```
   > [!CAUTION]
   > Do **NOT** use `docker compose down -v` or `docker compose down --volumes`.
   > - `docker compose stop` preserves containers and volumes.
   > - `docker compose down` removes containers and networks but **preserves volumes (`pgdata`, `n8ndata`)**.
   > - `docker compose down -v` **PERMANENTLY ERASES** all persistent volumes and database contents!

### 13.2 Clean Restart
```powershell
# 1. Start Docker containers
docker compose up -d postgres redis n8n

# 2. Start Gateway, Worker, and Frontend in their respective terminals
cd backend-nestjs-gateway; pnpm dev
cd backend-worker; pnpm dev
cd frontend-nextjs; pnpm dev
```

### 13.3 Disaster Recovery: Rebuilding a Corrupted Local Database
If the local PostgreSQL database is corrupted or in an unrecoverable state:

```powershell
# 1. Stop and remove containers and volumes
docker compose down -v

# 2. Re-create clean containers and fresh volumes
docker compose up -d postgres redis n8n

# 3. Apply committed migrations from scratch (up to migration 130)
cd backend-nestjs-gateway
npx prisma migrate deploy
cd ..
```

---

## 14. Final New Developer Checklist

Follow this chronological checklist on a brand-new Windows laptop to reach a fully verified, running application:

- [ ] **Step 1: Install Git for Windows** and configure line endings (`core.autocrlf false`).
- [ ] **Step 2: Install Node.js 24 LTS** and verify with `node --version`.
- [ ] **Step 3: Install pnpm 12.6.0** globally via `npm install -g pnpm@12.6.0`.
- [ ] **Step 4: Install Docker Desktop** with WSL2 backend enabled; start Docker.
- [ ] **Step 5: Set PowerShell Execution Policy** to `RemoteSigned` for CurrentUser.
- [ ] **Step 6: Create `C:\dev`** (strictly outside OneDrive) and clone the repository.
- [ ] **Step 7: Check out `integration/all-features`** and confirm clean `git status` at baseline `761f018`.
- [ ] **Step 8: Install dependencies** via `pnpm install`, approve builds via `pnpm approve-builds`, then `pnpm install`.
- [ ] **Step 9: Configure `.env` files** for root (`.env`), Gateway (`backend-nestjs-gateway\.env`), Worker (`backend-worker\.env`), and Frontend (`frontend-nextjs\.env.local`). Ensure Gateway uses `PORT=3001`.
- [ ] **Step 10: Start infrastructure containers** with `docker compose up -d postgres redis n8n`.
- [ ] **Step 11: Verify container health** via `docker compose ps` (all 3 must show healthy).
- [ ] **Step 12: Run database migrations** via `cd backend-nestjs-gateway; npx prisma migrate deploy; cd ..` (applies committed migrations up to `130`).
- [ ] **Step 13: Verify database readiness** without creating extra databases or seeding dummy business data (`docker compose exec postgres psql -U wsos -d wsos -c "\dn"`).
- [ ] **Step 14: Run verification tests and typechecks** (`pnpm --filter @fitness-ai/frontend-nextjs test` and `pnpm typecheck`).
- [ ] **Step 15: Start application servers** (Terminal 1: Gateway `pnpm dev`, Terminal 2: Worker `pnpm dev`, Terminal 3: Frontend `pnpm dev`).
- [ ] **Step 16: Open `http://localhost:3000`** in your browser and verify the running application.
- [ ] **(Optional Sandbox Only):** If exploring UI without real data, optionally run `pnpm --filter @fitness-ai/backend-nestjs-gateway exec tsx prisma/seeds/demo-tenant.seed.ts`.
