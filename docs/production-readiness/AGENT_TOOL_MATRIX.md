# Agent-Tool Matrix — Fitness AI / Wellness Studio OS

**Generated:** November 9, 2026  
**Source:** `@wsos/ai-tool-definitions/index.ts` (73 tools T-01..T-73) + `backend-nestjs-gateway/src/ai/agents/agent-registry.service.ts` + `backend-nestjs-gateway/src/ai/ai.module.ts`

---

## Matrix Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Tool registered, PostgreSQL-backed, tested |
| ⚠️ | Tool registered, ERPNext bridge fallback, not tested live |
| ❌ | Tool defined but not registered / missing service |
| 🔄 | Tool registered, requires confirmation (write tool) |
| 📋 | Tool definition only (not in AiModule) |

---

## Agent-to-Tool Mapping

### 1. admin-copilot (Administration Assistant)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| T-01 | getExpiringMemberships | ✅ | ✅ | StudioInsightsService (PG) | ✅ |
| T-02 | getLowAttendanceClasses | ✅ | ✅ | StudioInsightsService (PG) | ✅ |
| T-03 | extractCreateMemberFields | ✅ | ✅ | Local deterministic | ✅ |
| T-04 | createMember | ✅ | ✅ | ERPNext bridge | 🔄 ⚠️ |
| T-05 | getMemberCount | ✅ | ✅ | StudioInsightsService (PG) | ✅ |
| T-06 | getDashboardSummary | ✅ | ✅ | StudioInsightsService (PG) + ERP fallback | ✅ |
| T-72 | getRevenueSummary | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-73 | getRevenueTrends | ✅ | ✅ | ERPNext bridge | ⚠️ |

**Total: 8 tools | 6 PG-backed | 2 ERP bridge | 0 missing**

---

### 2. public-enquiry (Public Enquiry Assistant)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| T-07 | getPublicEventList | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-08 | getPublicClassSchedule | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-09 | getActivePlansPublic | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-10 | captureLead | ✅ | ✅ | ERPNext bridge | 🔄 ⚠️ |

**Total: 4 tools | 0 PG-backed | 4 ERP bridge | 0 missing**

---

### 3. booking-assistant (Booking Assistant)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| T-11 | getEligibleSchedule | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-12 | getAvailability | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-13 | getMemberPlanEntitlement | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-13C | getMyBookings | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-13A | createBooking | ✅ | ✅ | ERPNext bridge | 🔄 ⚠️ |
| T-13B | cancelBooking | ✅ | ✅ | ERPNext bridge | 🔄 ⚠️ |

**Total: 6 tools | 0 PG-backed | 6 ERP bridge | 0 missing**

---

### 4. recommendation-assistant (Recommendation Assistant)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| T-14 | getMemberGoalAndLevel | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-15 | getMemberAttendanceSummary | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-16 | getEligibleSessionsForRecommendation | ✅ | ✅ | ERPNext bridge | ⚠️ |

**Total: 3 tools | 1 PG-backed (via RecommendationsService) | 2 ERP bridge | 0 missing**

---

### 5. feedback-intelligence (Feedback Intelligence Assistant)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| T-17 | classifyFeedback | ✅ | ✅ | LLM Gateway | ✅ |
| T-18 | storeFeedbackClassification | ✅ | ✅ | Prisma (PG) | ✅ |
| T-19 | getFeedbackSummary | ✅ | ✅ | FeedbackService (PG) | ✅ |

**Total: 3 tools | 2 PG-backed | 1 LLM | 0 missing**

---

### 6. crm-agent (CRM & Lead Pipeline Agent)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| T-26 | scoreLead | ✅ | ✅ | LeadScoringService (PG) | ✅ |
| T-27 | getPipelineOverview | ✅ | ✅ | PipelineService (PG) | ✅ |
| T-28 | moveLeadInPipeline | ✅ | ✅ | PipelineService (PG) | 🔄 |
| T-29 | createPipelineStage | ✅ | ✅ | PipelineService (PG) | 🔄 |
| T-30 | createCrmCampaign | ✅ | ✅ | CrmCampaignService (PG) | 🔄 |
| T-31 | enrollInCampaign | ✅ | ✅ | CrmCampaignService (PG) | 🔄 |
| T-32 | getCampaignMetrics | ✅ | ✅ | CrmCampaignService (PG) | ✅ |

**Total: 7 tools | 7 PG-backed | 0 ERP bridge | 0 missing**

---

### 7. operations-agent (Studio Operations Agent)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| T-42 | getClassCapacityUtilization | ✅ | ✅ | OperationsService (PG) | ✅ |
| T-43 | getStaffSchedule | ✅ | ✅ | StaffSchedulingService (PG) | ✅ |
| T-44 | createStaffSchedule | ✅ | ✅ | StaffSchedulingService (PG) | 🔄 |
| T-45 | getEquipmentStatus | ✅ | ✅ | EquipmentService (PG) | ✅ |
| T-46 | scheduleEquipmentMaintenance | ✅ | ✅ | EquipmentService (PG) | 🔄 |
| T-47 | getFacilityUtilization | ✅ | ✅ | **Missing FacilityService** | ❌ |
| T-48 | manageWaitlist | ✅ | ✅ | WaitlistService (PG) | ✅ |
| T-49 | getOperationalAlerts | ✅ | ✅ | OperationsService (PG) | ✅ |
| T-50 | acknowledgeOperationalAlert | ✅ | ✅ | OperationsService (PG) | ✅ |
| T-51 | getClassCancellationImpact | ✅ | ✅ | **Missing ClassCancellationImpactService** | ❌ |
| T-52 | optimizeClassSchedule | ✅ | ✅ | **Missing ScheduleOptimizationService** | ❌ |

**Total: 11 tools | 8 PG-backed | 0 ERP bridge | 3 missing services**

---

### 8. marketing-agent (Marketing Campaign Agent)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| T-62 | getCampaignPerformance | ✅ | ✅ | MarketingAnalyticsService (PG) | ✅ |
| T-63 | createMarketingCampaign | ✅ | ✅ | CampaignService (PG) | 🔄 |
| T-64 | getAudienceSegments | ✅ | ✅ | AudienceService (PG) | ✅ |
| T-65 | createAudienceSegment | ✅ | ✅ | AudienceService (PG) | 🔄 |
| T-66 | getContentCalendar | ✅ | ✅ | ContentService (PG) | ✅ |
| T-67 | scheduleContent | ✅ | ✅ | ContentService (PG) | 🔄 |
| T-68 | getLeadAttribution | ✅ | ✅ | **Missing AttributionService** | ❌ |
| T-69 | getBrandHealthMetrics | ✅ | ✅ | **Missing BrandService** | ❌ |
| T-70 | manageReviewResponse | ✅ | ✅ | **Missing ReviewManagementService** | ❌ |
| T-71 | getCompetitorIntelligence | ✅ | ✅ | CompetitorIntelligenceService (PG) | ✅ |

**Total: 10 tools | 7 PG-backed | 0 ERP bridge | 3 missing services**

---

### 9. advertising-agent (Advertising & Attribution Agent)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| — | attribution-report | ❌ Not defined | ❌ | — | ❌ No tools |
| — | roas-metrics | ❌ Not defined | ❌ | — | ❌ No tools |
| — | channel-recommendations | ❌ Not defined | ❌ | — | ❌ No tools |

**Total: 0 tools | Agent has no dedicated tools defined in @wsos/ai-tool-definitions**

> **Note:** The advertising-agent in `agent-registry.service.ts` lists 3 capabilities (attribution-report, roas-metrics, channel-recommendations) but these tools are not defined in `@wsos/ai-tool-definitions`. The agent's handler returns empty data.

---

### 10. growth-agent (Growth Optimization Agent)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| T-53 | getAcquisitionMetrics | ✅ | ✅ | GrowthAnalyticsService (PG) | ✅ |
| T-54 | getReferralProgramMetrics | ✅ | ✅ | ReferralService (PG) | ✅ |
| T-55 | createReferralCampaign | ✅ | ✅ | ReferralService (PG) | 🔄 |
| T-56 | getUpsellOpportunities | ✅ | ✅ | UpsellService (PG) | ✅ |
| T-57 | createUpsellOffer | ✅ | ✅ | UpsellService (PG) | 🔄 |
| T-58 | getLifetimeValueMetrics | ✅ | ✅ | **Missing LifetimeValueService** | ❌ |
| T-59 | getExpansionOpportunities | ✅ | ✅ | **Missing ExpansionService** | ❌ |
| T-60 | trackGrowthExperiment | ✅ | ✅ | ExperimentService (PG) | ✅ |
| T-61 | createGrowthExperiment | ✅ | ✅ | ExperimentService (PG) | 🔄 |

**Total: 9 tools | 7 PG-backed | 0 ERP bridge | 2 missing services**

---

### 11. studio-insights (Studio Insights & Revenue Intelligence Agent)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| T-72 | getRevenueSummary | ✅ | ✅ | ERPNext bridge | ⚠️ |
| T-73 | getRevenueTrends | ✅ | ✅ | ERPNext bridge | ⚠️ |
| — | churn-risk-modeling | ❌ Not a tool | ✅ Via StudioInsightsService | StudioInsightsService (PG) | ✅ |
| — | dashboard-kpi | ❌ Not a tool | ✅ Via StudioInsightsService | StudioInsightsService (PG) | ✅ |

**Total: 2 tools (T-72, T-73) + 2 service methods | 2 PG-backed (service methods) | 2 ERP bridge (tools) | 0 missing**

---

### 12. session-summary (Session Summary & Post-Class Intelligence Agent)
| Tool ID | Tool Name | Definition | Registered | Data Source | Status |
|---------|-----------|------------|------------|-------------|--------|
| — | session-debrief | ❌ Not defined | ❌ | — | ❌ No tools |
| — | trainer-notes | ❌ Not defined | ❌ | — | ❌ No tools |
| — | member-milestones | ❌ Not defined | ❌ | — | ❌ No tools |

**Total: 0 tools | Agent has no dedicated tools defined in @wsos/ai-tool-definitions**

> **Note:** The session-summary in `agent-registry.service.ts` lists 3 capabilities (session-debrief, trainer-notes, member-milestones) but these tools are not defined in `@wsos/ai-tool-definitions`. The agent's handler returns empty data.

---

## Cross-Agent Tool Usage Summary

### Tools Used by Multiple Agents

| Tool ID | Tool Name | Primary Agent | Also Used By |
|---------|-----------|---------------|--------------|
| T-72 | getRevenueSummary | admin-copilot | studio-insights |
| T-73 | getRevenueTrends | admin-copilot | studio-insights |
| T-06 | getDashboardSummary | admin-copilot | (orchestrator internal) |
| T-05 | getMemberCount | admin-copilot | (orchestrator internal) |
| T-42 | getClassCapacityUtilization | operations-agent | (orchestrator internal) |
| T-49 | getOperationalAlerts | operations-agent | (orchestrator internal) |

---

## Missing Services Summary

| Service | Tools Affected | Agents Affected | Priority |
|---------|----------------|-----------------|----------|
| FacilityService | T-47 | operations-agent | P1 |
| ScheduleOptimizationService | T-52 | operations-agent | P1 |
| ClassCancellationImpactService | T-51 | operations-agent | P1 |
| ExpansionService | T-59 | growth-agent | P1 |
| LifetimeValueService | T-58 | growth-agent | P1 |
| AttributionService | T-68 | marketing-agent | P1 |
| BrandService | T-69 | marketing-agent | P1 |
| ReviewManagementService | T-70 | marketing-agent | P1 |

---

## Tools Requiring Confirmation (Write Tools)

| Tool ID | Tool Name | Agent | Confirmation Required |
|---------|-----------|-------|----------------------|
| T-04 | createMember | admin-copilot | ✅ |
| T-10 | captureLead | public-enquiry | ✅ |
| T-13A | createBooking | booking-assistant | ✅ |
| T-13B | cancelBooking | booking-assistant | ✅ |
| T-13A | createBooking | booking-assistant | ✅ |
| T-28 | moveLeadInPipeline | crm-agent | ✅ |
| T-29 | createPipelineStage | crm-agent | ✅ |
| T-30 | createCrmCampaign | crm-agent | ✅ |
| T-31 | enrollInCampaign | crm-agent | ✅ |
| T-37 | createWinbackCampaign | retention | ✅ |
| T-38 | sendWinbackCampaign | retention | ✅ |
| T-39 | createRetentionAction | retention | ✅ |
| T-44 | createStaffSchedule | operations-agent | ✅ |
| T-46 | scheduleEquipmentMaintenance | operations-agent | ✅ |
| T-50 | acknowledgeOperationalAlert | operations-agent | ✅ |
| T-55 | createReferralCampaign | growth-agent | ✅ |
| T-57 | createUpsellOffer | growth-agent | ✅ |
| T-61 | createGrowthExperiment | growth-agent | ✅ |
| T-63 | createMarketingCampaign | marketing-agent | ✅ |
| T-65 | createAudienceSegment | marketing-agent | ✅ |
| T-67 | scheduleContent | marketing-agent | ✅ |
| T-70 | manageReviewResponse | marketing-agent | ✅ |

**Total: 25 write tools requiring confirmation**

---

## ERPNext Bridge Tools (33 mappings in erpMethodMap)

| Tool ID | Tool Name | ERP Method | Status |
|---------|-----------|------------|--------|
| T-01 | getExpiringMemberships | REPORT_EXPIRING_MEMBERSHIPS | Bridge |
| T-02 | getLowAttendanceClasses | REPORT_LOW_ATTENDANCE | Bridge |
| T-03 | extractCreateMemberFields | wellness_studio.api.ai.extract_member_fields | Bridge |
| T-04 | createMember | MEMBER_CREATE | Bridge |
| T-05 | getMemberCount | MEMBER_LIST | Bridge |
| T-06 | getDashboardSummary | REPORT_DASHBOARD_STATS | Bridge |
| T-07 | getPublicEventList | EVENT_LIST | Bridge |
| T-08 | getPublicClassSchedule | SCHEDULE_LIST | Bridge |
| T-09 | getActivePlansPublic | MEMBERSHIP_LIST | Bridge |
| T-10 | captureLead | LEAD_CREATE | Bridge |
| T-11 | getEligibleSchedule | SCHEDULE_LIST | Bridge |
| T-12 | getAvailability | BOOKING_LIST | Bridge |
| T-13 | getMemberPlanEntitlement | MEMBERSHIP_GET | Bridge |
| T-13A | createBooking | wellness_studio.api.booking.book_by_schedule | Bridge |
| T-13B | cancelBooking | BOOKING_CANCEL | Bridge |
| T-13C | getMyBookings | BOOKING_LIST | Bridge |
| T-14 | getMemberGoalAndLevel | MEMBER_GET | Bridge |
| T-15 | getMemberAttendanceSummary | ATTENDANCE_LIST | Bridge |
| T-16 | getEligibleSessionsForRecommendation | SCHEDULE_LIST | Bridge |
| T-72 | getRevenueSummary | REPORT_REVENUE_SUMMARY | Bridge |
| T-73 | getRevenueTrends | REPORT_REVENUE_TRENDS | Bridge |
| T-26..T-32 | CRM tools | PIPELINE_*/CRM_* | Bridge |
| T-33..T-41 | Retention tools | RETENTION_*/WINBACK_* | Bridge |
| T-42..T-52 | Operations tools | REPORT_*/STAFF_*/EQUIPMENT_* | Bridge |
| T-53..T-61 | Growth tools | GET_*/CREATE_* | Bridge |
| T-62..T-71 | Marketing tools | GET_*/CREATE_* | Bridge |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total tool definitions (T-01..T-73) | 73 |
| Tools registered with classes in AiModule | 56 |
| Tools via ERPNext bridge fallback | 17 |
| Tools with missing services | 6 |
| Tools with no implementation (advertising-agent, session-summary) | 0 (not defined) |
| PostgreSQL-backed tools | 37 |
| ERPNext bridge tools | 17 |
| LLM-based tools | 1 (classifyFeedback) |
| Local/deterministic tools | 1 (extractCreateMemberFields) |
| Write tools requiring confirmation | 25 |
| Read tools | 48 |

---

## Agent Capability Coverage

| Agent | Defined Capabilities | Tools Mapped | Coverage |
|-------|---------------------|--------------|----------|
| admin-copilot | 5 | 8 | 160%* |
| public-enquiry | 5 | 4 | 80% |
| booking-assistant | 7 | 6 | 86% |
| recommendation-assistant | 3 | 3 | 100% |
| feedback-intelligence | 3 | 3 | 100% |
| crm-agent | 4 | 7 | 175%* |
| operations-agent | 4 | 11 | 275%* |
| marketing-agent | 4 | 10 | 250%* |
| advertising-agent | 3 | 0 | 0% |
| growth-agent | 4 | 9 | 225%* |
| studio-insights | 4 | 2+2 | 100% |
| session-summary | 3 | 0 | 0% |

*Some agents have more tools than declared capabilities because tools serve multiple purposes or are shared.

---

*Generated from codebase analysis. For latest status, run the test suite and check IMPLEMENTATION_TRACKER.md*