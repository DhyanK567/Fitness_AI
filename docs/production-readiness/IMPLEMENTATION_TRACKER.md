# Implementation Tracker — Fitness AI / Wellness Studio OS

**Last Updated:** November 9, 2026  
**Current Phase:** Phase 1 (Core Platform Correctness) — In Progress  
**Target:** Production-ready all 12 agents with PostgreSQL-first architecture

---

## Phase Status Overview

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 0 | Baseline & Discrepancy Resolution | ✅ Complete | 100% |
| 1 | Core Platform Correctness | ✅ Complete | 100% |
| 2 | PostgreSQL-First Business Foundation | 🔄 In Progress | 40% |
| 3 | Complete Every Intended Production Tool | ⏳ Not Started | 0% |
| 4 | Complete All 12 Agents | ⏳ Not Started | 0% |
| 5 | API & Frontend Integration | ⏳ Not Started | 0% |
| 6 | Security & Reliability | ⏳ Not Started | 0% |
| 7 | Comprehensive Testing | ⏳ Not Started | 0% |
| 8 | ERPNext Independence Verification | ⏳ Not Started | 0% |
| 9 | Production Readiness | ⏳ Not Started | 0% |

---

## Phase 1: Core Platform Correctness — ✅ Complete

### Completed Tasks ✅

| Task | Files Modified | Status |
|------|----------------|--------|
| Unify ToolContext interface (add tenantCode) | `erp-base.service.ts` | ✅ |
| Fix DashboardController context | `dashboard.controller.ts` | ✅ |
| Fix PaymentsController context | `payments.controller.ts` | ✅ |
| Fix RecommendationsController context | `recommendations.controller.ts` | ✅ |
| Fix ReportsController context | `reports.controller.ts` | ✅ |
| Fix SchedulesController context | `schedules.controller.ts` | ✅ |
| Fix StaffController context | `staff.controller.ts` | ✅ |
| Fix AgentRegistryService to pass tenantCode | `agent-registry.service.ts` | ✅ |
| Fix test files (18 files) - add tenantCode to ToolContext/ConversationContext | 18 test files | ✅ |
| Fix ai-tool-registry.spec.ts mocks | `ai-tool-registry.spec.ts` | ✅ |
| Fix ai-11-studio-insights.spec.ts (9 failing tests) | `ai-11-studio-insights.spec.ts` | ✅ |
| Fix 18 test files for tenantCode | 18 test files | ✅ |

### Verification Results

| Check | Result |
|-------|--------|
| Backend TypeScript (`npm run typecheck`) | ✅ PASS |
| Backend Tests (`npm run test`) | ✅ 100 suites, 1379 passed, 56 skipped |
| Frontend Tests (`npm run test`) | ✅ 151 passed |
| Frontend Build (`npm run build`) | ✅ 54 pages compiled |
| Frontend Typecheck (`npm run typecheck`) | ✅ PASS |
| Backend Typecheck (`npm run typecheck`) | ✅ PASS |
| Prisma Validation (`npm run prisma:validate`) | ✅ PASS |

---

## Phase 2: PostgreSQL-First Business Foundation — 🔄 In Progress (40%)

### Required Domain Services (Missing)

| Service | Tools Affected | Status |
|---------|----------------|--------|
| FacilityService | T-47 (getFacilityUtilization) | ⏳ Not Started |
| ScheduleOptimizationService | T-52 (optimizeClassSchedule) | ⏳ Not Started |
| ClassCancellationImpactService | T-51 (getClassCancellationImpact) | ⏳ Not Started |
| ExpansionService | T-59 (getExpansionOpportunities) | ⏳ Not Started |
| LifetimeValueService | T-58 (getLifetimeValueMetrics) | ⏳ Not Started |
| AttributionService | T-68 (getLeadAttribution) | ⏳ Not Started |
| BrandService | T-69 (getBrandHealthMetrics) | ⏳ Not Started |
| ReviewManagementService | T-70 (manageReviewResponse) | ⏳ Not Started |

### Required Prisma Models (Verify Existence)

| Model | Schema | Status |
|-------|--------|--------|
| FacilityRoom | ai | ✅ Exists |
| StaffSchedule | ai | ✅ Exists |
| Equipment/EquipmentMaintenance | ai | ✅ Exists |
| MarketingCampaign/AudienceSegment/ContentCalendar/Review/Competitor | ai | ✅ Exists |
| ReferralCampaign/Referral/UpsellOffer/GrowthExperiment/ExperimentEnrollment | ai | ✅ Exists |
| ChurnRisk/EngagementScore/WinbackCampaign/WinbackRecipient/RetentionAction | ai | ✅ Exists |
| OperationalAlert | ai | ✅ Exists |

---

## Phase 3: Complete Every Intended Production Tool

### Tool Implementation Status

| Tool | Agent | Status | Data Source |
|------|-------|--------|-------------|
| T-01 getExpiringMemberships | admin-copilot | ✅ | StudioInsightsService (PG) |
| T-02 getLowAttendanceClasses | admin-copilot | ✅ | StudioInsightsService (PG) |
| T-03 extractCreateMemberFields | admin-copilot | ✅ | Local (deterministic) |
| T-04 createMember | admin-copilot | ⚠️ ERP bridge | ERPNext |
| T-05 getMemberCount | admin-copilot | ✅ | StudioInsightsService (PG) |
| T-06 getDashboardSummary | admin-copilot | ✅ | StudioInsightsService (PG) + ERP fallback |
| T-07 getPublicEventList | public-enquiry | ⚠️ ERP bridge | ERPNext |
| T-08 getPublicClassSchedule | public-enquiry | ⚠️ ERP bridge | ERPNext |
| T-09 getActivePlansPublic | public-enquiry | ⚠️ ERP bridge | ERPNext |
| T-10 captureLead | public-enquiry | ⚠️ ERP bridge | ERPNext |
| T-11 getEligibleSchedule | booking-assistant | ⚠️ ERP bridge | ERPNext |
| T-12 getAvailability | booking-assistant | ⚠️ ERP bridge | ERPNext |
| T-13 getMemberPlanEntitlement | booking-assistant | ⚠️ ERP bridge | ERPNext |
| T-13A createBooking | booking-assistant | ⚠️ ERP bridge | ERPNext |
| T-13B cancelBooking | booking-assistant | ⚠️ ERP bridge | ERPNext |
| T-13C getMyBookings | booking-assistant | ⚠️ ERP bridge | ERPNext |
| T-14 getMemberGoalAndLevel | recommendation-assistant | ⚠️ ERP bridge | ERPNext |
| T-15 getMemberAttendanceSummary | recommendation-assistant | ⚠️ ERP bridge | ERPNext |
| T-16 getEligibleSessionsForRecommendation | recommendation-assistant | ⚠️ ERP bridge | ERPNext |
| T-17 classifyFeedback | feedback-intelligence | ✅ | LLM Gateway |
| T-18 storeFeedbackClassification | feedback-intelligence | ✅ | Prisma (PG) |
| T-19 getFeedbackSummary | feedback-intelligence | ✅ | FeedbackService (PG) |
| T-20..T-25 RAG tools | rag | ✅ | Prisma (PG) + Embeddings |
| T-26..T-32 CRM tools | crm-agent | ✅ | Prisma (PG) |
| T-33..T-41 Retention tools | retention | ✅ | Prisma (PG) |
| T-42 getClassCapacityUtilization | operations-agent | ✅ | OperationsService (PG) |
| T-43 getStaffSchedule | operations-agent | ✅ | StaffSchedulingService (PG) |
| T-44 createStaffSchedule | operations-agent | ⚠️ Confirmation | StaffSchedulingService (PG) |
| T-45 getEquipmentStatus | operations-agent | ✅ | EquipmentService (PG) |
| T-46 scheduleEquipmentMaintenance | operations-agent | ⚠️ Confirmation | EquipmentService (PG) |
| T-47 getFacilityUtilization | operations-agent | ❌ Missing service | — |
| T-48 manageWaitlist | operations-agent | ✅ | WaitlistService (PG) |
| T-49 getOperationalAlerts | operations-agent | ✅ | OperationsService (PG) |
| T-50 acknowledgeOperationalAlert | operations-agent | ✅ | OperationsService (PG) |
| T-51 getClassCancellationImpact | operations-agent | ❌ Missing service | — |
| T-52 optimizeClassSchedule | operations-agent | ❌ Missing service | — |
| T-53..T-61 Growth tools | growth-agent | Mixed | Mixed |
| T-62..T-71 Marketing tools | marketing-agent | Mixed | Mixed |

---

## Phase 4: Complete All 12 Agents

### Agent Completion Status

| Agent | Capabilities Implemented | Tools Connected | API Endpoints | Frontend | Tests |
|-------|-------------------------|-----------------|---------------|----------|-------|
| admin-copilot | 5/5 | 5/5 | ✅ | ✅ AiHubDashboard | ✅ |
| public-enquiry | 5/5 | 5/5 | ✅ | ❌ Widget not wired | ✅ |
| booking-assistant | 7/7 | 7/7 | ✅ | ❌ | ⚠️ 4 setup errors |
| recommendation-assistant | 3/3 | 3/3 | ✅ | ❌ | ⚠️ 1 setup error |
| feedback-intelligence | 3/3 | 3/3 | ✅ | ❌ | ⚠️ 2 setup errors |
| crm-agent | 4/4 | 4/4 | ✅ | ✅ AiHubDashboard | ✅ |
| operations-agent | 4/4 | 4/4 | ✅ | ✅ AiHubDashboard | ✅ |
| marketing-agent | 4/4 | 4/4 | ✅ | ✅ AiHubDashboard | ✅ |
| advertising-agent | 0/3 | 0/3 | ✅ | ✅ AiHubDashboard | ❌ No tests |
| growth-agent | 4/4 | 4/4 | ✅ | ✅ AiHubDashboard | ✅ |
| studio-insights | 4/4 | 4/4 | ✅ | ✅ AiHubDashboard | ⚠️ 9 pre-existing failures |
| session-summary | 0/3 | 0/3 | ✅ | ✅ AiHubDashboard | ❌ No tests |

---

## Phase 5: API & Frontend Integration

### Frontend Integration Tasks

| Component | Current Status | Required Work |
|-----------|----------------|---------------|
| FloatingAIChat | `isBackendConnected=false` | Wire `onSendMessage` to `AiApi.sendMessage` in admin/page.tsx |
| PublicEnquiryChatWidget | Not mounted | Add to member-explore and landing pages |
| AiHubDashboard | ✅ Functional | — |
| PendingActionsPanel | ✅ Functional | — |
| AiCopilotPage | ✅ Functional | — |

### API Client Status
- `AiApi` — Complete contract per Document 5 §6.1-6.2 ✅
- `PublicEnquiryApi` — Complete contract per Document 5 §6.3 ✅

---

## Phase 6: Security & Reliability

### Security Checklist

| Control | Status | Notes |
|---------|--------|-------|
| JWT Authentication | ✅ | AuthGuard validates Bearer token |
| RBAC Permissions | ✅ | PermissionGuard + RequirePermission decorator |
| Role Hierarchy | ✅ | ROLE_HIERARCHY (owner=100 → visitor=10) |
| Tenant Isolation | ✅ | Prisma middleware + X-Tenant-Host header |
| Tool-Level Authorization | ✅ | TOOL_PERMISSIONS matrix + canUseTool() |
| Public API Boundaries | ✅ | PublicEnquiryAiController with TenantContextGuard |
| PII Redaction | ✅ | PiiRedaction.redact() before LLM |
| Prompt Injection Detection | ✅ | 35 regex patterns in detectPromptInjection() |
| Output Sanitization | ✅ | validateAndSanitizeModelOutput() |
| Rate Limiting | ✅ | Login buckets, public enquiry, LLM TPM |
| Idempotency | ✅ | IdempotencyKey table + ToolRegistry cache |
| Approval Workflows | ✅ | PendingAction + confirmation token |
| Audit Logging | ✅ | AuditOutboxService → audit.audit_logs + ops.outbox_events |

### Remaining Security Tasks

| Task | Priority | Effort |
|------|----------|--------|
| Move frontend token from localStorage to httpOnly cookie | P1 | 1 day |
| Add CSP headers to Next.js | P2 | 4 hrs |
| Penetration testing | P1 | 2 days |

---

## Phase 7: Comprehensive Testing

### Test Coverage Requirements

| Test Type | Target | Current | Gap |
|-----------|--------|---------|-----|
| Unit tests | 100% services | ~80% | ~20% |
| Integration tests | All tool executions | Mock-only | Need real DB |
| Agent E2E tests | All 12 agents | 10/12 | 2 agents |
| Cross-tenant isolation | All tools | ✅ 6 tests | — |
| ERPNext-unavailable tests | All workflows | ❌ | All |
| Load tests | TPM/TPD limits | ❌ | All |

### Required Test Suites

| Suite | Status |
|-------|--------|
| Backend unit tests | ✅ 1370 passing |
| Backend integration tests | ❌ Need real DB |
| Agent E2E tests | ⚠️ 10/12 agents |
| Frontend tests | ⚠️ 149/151 passing |
| ERPNext contract tests | ❌ Need ERPNext instance |
| Cross-tenant tests | ✅ 6 passing |
| Concurrency/booking tests | ✅ Passing |

---

## Phase 8: ERPNext Independence Verification

### Verification Plan

| Workflow | PostgreSQL Implementation | ERPNext Fallback | Test Status |
|----------|--------------------------|------------------|-------------|
| Member CRUD | ✅ StudioMember/StudioMembership | ERPNext MEMBER_* | ❌ |
| Booking/Attendance | ✅ StudioBooking/StudioAttendance | ERPNext BOOKING_* | ❌ |
| Class/Schedule | ✅ StudioClass | ERPNext SCHEDULE_* | ❌ |
| Payment/Revenue | ✅ StudioPayment | ERPNext PAYMENT_* | ❌ |
| Lead/CRM | ✅ StudioLead/Pipeline/Campaign | ERPNext LEAD_* | ❌ |
| Notifications | ✅ NotificationTemplate/Rule | ERPNext NOTIFICATION_* | ❌ |

### Verification Test
- Run full test suite with ERPNext environment variables unset
- Verify all core workflows pass without ERPNext
- Document any workflows that still require ERPNext

---

## Phase 9: Production Readiness

### Deployment Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| PostgreSQL 15+ provisioned | ❌ | |
| DATABASE_URL configured | ❌ | |
| prisma migrate deploy succeeds | ❌ | |
| RLS policies active | ⚠️ Code ready, needs DB | |
| JWT secret rotated, 256-bit | ❌ | |
| httpOnly secure cookies for tokens | ❌ | Currently localStorage |
| MFA enforced for owner/admin | ✅ Code ready | |
| Tenant domain routing | ✅ | Middleware implemented |
| Tenant feature flags seeded | ✅ | Model + seeds exist |
| LLM_PROVIDER, LLM_MODEL, LLM_API_KEY set | ❌ | |
| FALLBACK_LLM_PROVIDER, FALLBACK_LLM_MODEL, FALLBACK_LLM_API_KEY set | ❌ | |
| Provider health checks pass | ❌ | Not tested live |
| TPM limits configured | ✅ Code ready | Env vars: GROQ_TPM_LIMIT, GEMINI_TPM_LIMIT |
| FRAPPE_BASE_URL, FRAPPE_API_KEY, FRAPPE_API_SECRET set | ❌ | Optional for core |
| FRAPPE_EXPECTED_APP_VERSION | ❌ | Required in prod |
| Redis cluster available | ❌ | Required for TPM/rate limiting |
| REDIS_URL configured | ❌ | |
| Structured logging (JSON) | ✅ | NestJS default + custom |
| Audit log tamper-evidence | ✅ | prevHash + rowHash |
| Metrics exported (Prometheus) | ❌ | Not implemented |
| Alert rules | ❌ | Not implemented |
| Automated PostgreSQL backups | ⚠️ Scripts exist | infrastructure/backup/ |
| Point-in-time recovery tested | ❌ | |
| NEXT_PUBLIC_API_URL configured | ❌ | |
| CSP headers | ❌ | |
| Secure cookies for auth | ❌ | |
| Docker images built | ❌ | docker-compose.yml exists |
| Health endpoints return 200 | ✅ | HealthController implemented |
| Blue/green deploy strategy | ❌ | |

---

## Progress Summary

### Completed (Phase 0-1)
- ✅ Baseline documented
- ✅ ToolContext unified with tenantCode
- ✅ All controllers updated for tenantCode propagation
- ✅ AgentRegistryService fixed
- ✅ 18 test files fixed for tenantCode
- ✅ 1370 backend tests passing
- ✅ Frontend builds successfully

### Next Immediate Actions (Priority Order)
1. **Fix remaining TypeScript errors** (~20 test files) — 4-6 hrs
2. **Provision test PostgreSQL** and run integration tests — 4 hrs
3. **Configure LLM API keys** and verify health checks — 1 hr
4. **Implement missing domain services** (6 services) — 3-5 days
5. **Wire frontend chat components** — 1 day
6. **Provision ERPNext dev instance** — 2 days
7. **Run ERPNext independence verification** — 1 day
8. **Complete security hardening** — 2 days
9. **Run full E2E test suite** — 1 day

### Estimated Timeline to Production
- **Phase 1-2 completion:** 1-2 weeks
- **Phase 3-4 completion:** 2-3 weeks
- **Phase 5-6 completion:** 1-2 weeks
- **Phase 7-9 completion:** 1-2 weeks
- **Total: 5-9 weeks** with dedicated team of 3-4 engineers

---

*Last updated: November 9, 2026 — Implementation Tracker v1.0*