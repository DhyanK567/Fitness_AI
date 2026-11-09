# Fitness AI / Wellness Studio OS — Production Readiness Baseline (Updated)

**Date:** November 9, 2026  
**Branch:** `main`  
**Commit:** `66c707d fix: update AI agent changes`  
**Git Status:** Clean working tree, no uncommitted changes

---

## Repository Structure

```
/home/dell/Dev/fitness-ai/
├── backend-nestjs-gateway/    # Primary NestJS API Gateway
├── backend-worker/            # Background jobs (schedulers, outbox dispatcher)
├── frontend-nextjs/           # Next.js 14 App Router frontend
├── shared/                    # Shared packages
│   ├── ai-tool-definitions/   # Tool definitions (73 tools T-01..T-73)
│   ├── erp-methods/           # ERPNext method constants
│   ├── api-contracts/         # API contracts
│   ├── error-codes/           # Error codes
│   ├── shared-types/          # Shared TypeScript types
│   ├── test-utils/            # Test utilities
│   ├── typescript-config/     # TypeScript configs
│   └── ui-design-system/      # UI components
├── tests/                     # Cross-cutting E2E, contract, concurrency tests
├── infrastructure/            # Docker, nginx, monitoring, backup scripts
├── automation-n8n/            # n8n workflows
└── Data/                      # Demo CSV data files
```

---

## Current 12 Agents (Registered in AgentRegistryService)

| # | Agent ID | Name | Type | Category | Capabilities | Status |
|---|----------|------|------|----------|--------------|--------|
| 1 | `admin-copilot` | Admin Assistant / Live Copilot | assistant | Administration | 5 (expiring-memberships, low-attendance, member-count, dashboard-summary, create-member) | ✅ Registered, Functional |
| 2 | `public-enquiry` | Public Enquiry Assistant | assistant | Customer Experience | 5 (faq-summary, public-events, class-schedules, active-plans, capture-lead) | ✅ Registered, Functional |
| 3 | `booking-assistant` | Booking Assistant | assistant | Customer Experience | 7 (check-availability, eligible-schedule, plan-entitlement, booking-history, waitlist-management, create-booking, cancel-booking) | ✅ Registered, Functional |
| 4 | `recommendation-assistant` | Recommendation Assistant | assistant | Customer Experience | 3 (recommend-sessions, member-history, member-goals) | ✅ Registered, Functional |
| 5 | `feedback-intelligence` | Feedback Intelligence Assistant | assistant | Customer Experience | 3 (sentiment-summary, classify-text, trend-analysis) | ✅ Registered, Functional |
| 6 | `crm-agent` | CRM & Lead Pipeline Agent | agent | Growth & Marketing | 4 (pipeline-overview, score-lead, active-campaigns, move-stage) | ✅ Registered, Functional |
| 7 | `operations-agent` | Studio Operations Agent | agent | Operations | 4 (capacity-utilization, equipment-status, operational-alerts, schedule-maintenance) | ✅ Registered, Functional |
| 8 | `marketing-agent` | Marketing Campaign Agent | agent | Growth & Marketing | 4 (campaign-performance, audience-segments, content-calendar, competitor-intelligence) | ✅ Registered, Functional |
| 9 | `advertising-agent` | Advertising & Attribution Agent | agent | Growth & Marketing | 3 (attribution-report, roas-metrics, channel-recommendations) | ⚠️ No dedicated tools |
| 10 | `growth-agent` | Growth Optimization Agent | agent | Growth & Marketing | 4 (upsell-opportunities, referral-metrics, growth-experiments, ltv-analytics) | ✅ Registered, Functional |
| 11 | `studio-insights` | Studio Insights & Revenue Intelligence | agent | Analytics | 4 (revenue-trends, revenue-summary, churn-risk-modeling, dashboard-kpi) | ✅ Registered, Functional |
| 12 | `session-summary` | Session Summary & Post-Class Intelligence | agent | Operations | 3 (session-debrief, trainer-notes, member-milestones) | ⚠️ No dedicated tools |

**Note:** Agents 9 (advertising-agent) and 12 (session-summary) have generic handlers returning empty data — they lack dedicated tools and services.

---

## Tool Ecosystem

### Tool Definitions (shared/ai-tool-definitions/index.ts)
- **Total:** 73 tools (T-01 through T-73)
- **Phases:** P0 (7 tools), P1 (12 tools), P2 (54 tools)
- **Assistants:** admin, enquiry, booking, recommendation, feedback, rag, operations, growth, marketing

### Registered Tools in AiModule (backend-nestjs-gateway/src/ai/ai.module.ts)
- **Registered at startup:** 56 tools (via toolClassMap in tool-registry.ts)
- **ERPNext bridge fallback:** 33 methods mapped in erpMethodMap
- **Missing service implementations:** 6+ tools reference services that don't exist

### Tool Registration Status
| Category | Defined | Registered | PostgreSQL-backed | ERPNext Bridge | Missing Service |
|----------|---------|------------|-------------------|----------------|-----------------|
| Admin (T-01..T-06, T-72, T-73) | 8 | 8 | 6 | 2 | 0 |
| Enquiry (T-07..T-10) | 4 | 4 | 0 | 4 | 0 |
| Booking (T-11..T-13B) | 6 | 6 | 0 | 6 | 0 |
| Recommendation (T-14..T-16) | 3 | 3 | 1 | 2 | 0 |
| Feedback (T-17..T-19) | 3 | 3 | 2 | 1 | 0 |
| RAG (T-20..T-25) | 6 | 6 | 5 | 0 | 0 |
| CRM (T-26..T-32) | 7 | 7 | 7 | 0 | 0 |
| Retention (T-33..T-41) | 9 | 9 | 9 | 0 | 0 |
| Operations (T-42..T-52) | 11 | 11 | 8 | 0 | 3 (FacilityService, ScheduleOptimizationService, ClassCancellationImpactService) |
| Growth (T-53..T-61) | 9 | 9 | 7 | 0 | 2 (ExpansionService, LifetimeValueService) |
| Marketing (T-62..T-71) | 10 | 10 | 7 | 0 | 3 (AttributionService, BrandService, ReviewManagementService) |

**Total: 73 defined, 56 registered with classes, 17 via ERP bridge**

---

## Database Schema (Prisma Multi-Schema)

**6 Schemas:** `platform`, `iam`, `config`, `ops`, `audit`, `ai`

### Key Models by Schema
| Schema | Models | Purpose |
|--------|--------|---------|
| `platform` | Tenant, Studio, Branch, SubscriptionTier, TenantSubscription, TenantDomain, TenantFeatureFlag | Multi-tenancy foundation |
| `iam` | User, Role, Permission, AuthSession, UserRoleAssignment, TeamInvitation, UserTotp | Authentication & Authorization |
| `config` | FaqEntry, NotificationTemplate, EventCategory, TenantSetting | Configuration |
| `ops` | StudioMember, StudioClass, StudioBooking, StudioAttendance, StudioPayment, StudioEvent, StudioMembership, StudioLead | Core business data |
| `audit` | AuditLog, SecurityEvent | Tamper-evident audit trail |
| `ai` | Conversation, Message, PendingAction, KnowledgeBase, PipelineStage, ChurnRisk, EngagementScore, OperationalAlert, Equipment, MarketingCampaign, AudienceSegment, etc. | AI platform data |

---

## Current Test & Build Status (After Fixes)

### TypeScript Build (`npm run typecheck`)
```
Remaining: ~20 test files have TypeScript errors (tenantCode in ToolContext/ConversationContext)
```

### Unit Tests (`npm run test`)
```
Test Suites: 100 total, 99 passed, 1 failed, 3 skipped
Tests: 1435 total, 1370 passed, 9 failed, 56 skipped

Failed Suite: ai-11-studio-insights.spec.ts (9 pre-existing failures - churn risk, multi-tenant isolation, ARPU calculation)
```

### Frontend Build (`npm run build`)
```
✅ PASS - All 54 pages compiled successfully
```

### Frontend Tests (`npm run test`)
```
Tests: 151 total, 149 passed, 2 failed
Failures: Host header assertions in AI test mocks (environment config issue)
```

---

## ERPNext Integration Status

### Current Architecture
```
ToolRegistry.execute()
  → ToolRegistry.toolClassMap (56 registered classes)
    → If not found AND ErpnextService available → ErpBridgeTool
      → ErpnextService.call({ method: ERP_METHODS.X })
```

### ERPNext Bridge Mappings (33 methods in erpMethodMap)
All core business operations currently fall back to ERPNext:
- Member creation, booking, cancellation
- Class schedules, availability
- Membership entitlements
- Revenue summaries, trends
- Lead capture, pipeline operations

**Critical Issue:** No live ERPNext instance verified. All ERPNext-dependent tools will fail in production without ERPNext running.

---

## Frontend AI Integration

### Components
| Component | Path | Backend Connected | Status |
|-----------|------|-------------------|--------|
| `FloatingAIChat` | `components/chat/FloatingAIChat.tsx` | ❌ `isBackendConnected=false` default | Preview only |
| `PublicEnquiryChatWidget` | `features/ai/components/PublicEnquiryChatWidget.tsx` | ❌ Not mounted in pages | Not wired |
| `AiHubDashboard` | `features/ai/components/AiHubDashboard.tsx` | ✅ Uses `AiApi.getAgents()`, `executeAgentAction()` | Functional |
| `AiCopilotPage` | `app/admin/ai/page.tsx` | ✅ Renders `AiCopilotWrapper` → `AiHubDashboard` | Functional |
| `PendingActionsPanel` | `features/ai/components/PendingActionsPanel.tsx` | ✅ Uses `AiApi.getPendingActions()`, `confirmAction()` | Functional |

### API Clients
- `AiApi` (`features/ai/api/ai-api.ts`) — Complete contract per Document 5 §6.1-6.2
- `PublicEnquiryApi` (`features/ai/api/public-enquiry-api.ts`) — Complete contract per Document 5 §6.3

---

## Known Blockers (P0 - Production Deployment Prohibited)

| ID | Blocker | Evidence | Status |
|----|---------|----------|--------|
| B-001 | TypeScript compilation fails in test files | ~20 test files missing `tenantCode` in ToolContext/ConversationContext | **In Progress** |
| B-002 | No live PostgreSQL connection verified | All tests mock PrismaService; no integration test against real DB | **Not Started** |
| B-003 | No live LLM provider verified | `LlmGatewayService.healthCheck()` only checks config | **Not Started** |
| B-004 | No live ERPNext verified | All ERPNext tools use bridge fallback; custom app version check skipped | **Not Started** |
| B-005 | Frontend chat widgets disconnected | `FloatingAIChat.isBackendConnected=false`; no parent injects live handler | **Not Started** |
| B-006 | 2 agents non-functional | `advertising-agent`, `session-summary` lack dedicated tools/services | **Not Started** |
| B-007 | 6+ missing domain services | FacilityService, ScheduleOptimizationService, ClassCancellationImpactService, ExpansionService, BrandService, ReviewManagementService, AttributionService | **Not Started** |
| B-008 | Data consistency issues | Different "active member" definitions across tools; ERPNext vs PostgreSQL source conflicts | **Not Started** |

---

## Fixes Applied (Phase 0 → Phase 1)

### Core Fixes
1. **Unified ToolContext interface** - Added `tenantCode` to `ToolContext` in `erp-base.service.ts` (now matches `base-tool.ts`)
2. **Controller context propagation** - Fixed all controllers to include `tenantCode` in ToolContext:
   - DashboardController
   - PaymentsController
   - RecommendationsController
   - ReportsController
   - SchedulesController
   - StaffController
3. **Agent registry** - Fixed `agent-registry.service.ts` to pass `tenantCode` to `recommendationsService`
4. **Test file fixes** - Added `tenantCode` to ToolContext/ConversationContext in 18 test files:
   - ai-component4-booking-assistant.spec.ts
   - ai-component4-recommendation-assistant.spec.ts
   - ai-component5-feedback-intelligence.spec.ts
   - ai-contract-alignment.spec.ts
   - ai-evaluation/admin-queries.spec.ts
   - ai-evaluation/adversarial.spec.ts
   - ai-evaluation/ai-chat-permission.spec.ts
   - ai-evaluation/create-member-scenarios.spec.ts
   - ai-evaluation/cross-tenant.spec.ts
   - ai-evaluation/debug-mock.spec.ts
   - ai-evaluation/new-agents.integration.spec.ts
   - conversation-loop-tool-results.spec.ts
   - get-dashboard-summary.tool.spec.ts
   - tenant-isolation-pending-action.spec.ts

### Test Results After Fixes
- **Backend tests:** 1370 passed, 9 failed (pre-existing ai-11-studio-insights.spec.ts issues)
- **Frontend build:** ✅ PASS
- **Frontend tests:** 149 passed, 2 failed (Host header assertion in test mocks)

---

## Phase 0 Baseline Complete

This baseline documents the actual current state as of commit `66c707d` with Phase 1 fixes applied. All subsequent implementation work will reference this baseline.