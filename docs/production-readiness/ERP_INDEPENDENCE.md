# ERPNext Independence — Fitness AI / Wellness Studio OS

**Generated:** November 9, 2026  
**Objective:** Document the path to full PostgreSQL-first operation with ERPNext as optional integration

---

## Current Architecture

```
ToolRegistry.execute()
  → ToolRegistry.toolClassMap (56 registered classes)
    → If tool not found AND ErpnextService available → ErpBridgeTool
      → ErpnextService.call({ method: ERP_METHODS.X })
```

### Current State
- **56 tools** registered with dedicated classes (PostgreSQL-backed or mixed)
- **33 tools** mapped to ERPNext via `erpMethodMap` fallback
- **All core business operations** currently route through ERPNext bridge when tool class not registered
- **No live ERPNext instance verified** — all ERPNext-dependent tools untested in production conditions

---

## Tool Classification by Data Source

### PostgreSQL-First Tools (Ready for ERPNext Independence)

| Tool ID | Tool Name | Implementation | Status |
|---------|-----------|----------------|--------|
| T-01 | getExpiringMemberships | StudioInsightsService → Prisma | ✅ PG |
| T-02 | getLowAttendanceClasses | StudioInsightsService → Prisma | ✅ PG |
| T-03 | extractCreateMemberFields | Local deterministic regex | ✅ PG |
| T-05 | getMemberCount | StudioInsightsService → Prisma | ✅ PG |
| T-06 | getDashboardSummary | StudioInsightsService (primary) + ERP fallback | ✅ PG |
| T-17 | classifyFeedback | LLM Gateway | ✅ PG |
| T-18 | storeFeedbackClassification | Prisma (StudioSessionFeedback) | ✅ PG |
| T-19 | getFeedbackSummary | FeedbackService → Prisma | ✅ PG |
| T-20..T-25 | RAG tools | Prisma + pgvector | ✅ PG |
| T-26..T-32 | CRM tools | Prisma (Pipeline/Lead/Campaign) | ✅ PG |
| T-33..T-41 | Retention tools | Prisma (ChurnRisk/EngagementScore/Winback) | ✅ PG |
| T-42 | getClassCapacityUtilization | OperationsService → Prisma | ✅ PG |
| T-43 | getStaffSchedule | StaffSchedulingService → Prisma | ✅ PG |
| T-44 | createStaffSchedule | StaffSchedulingService → Prisma | ✅ PG |
| T-45 | getEquipmentStatus | EquipmentService → Prisma | ✅ PG |
| T-46 | scheduleEquipmentMaintenance | EquipmentService → Prisma | ✅ PG |
| T-48 | manageWaitlist | WaitlistService → Prisma | ✅ PG |
| T-49 | getOperationalAlerts | OperationsService → Prisma | ✅ PG |
| T-50 | acknowledgeOperationalAlert | OperationsService → Prisma | ✅ PG |
| T-53 | getAcquisitionMetrics | GrowthAnalyticsService → Prisma | ✅ PG |
| T-54 | getReferralProgramMetrics | ReferralService → Prisma | ✅ PG |
| T-55 | createReferralCampaign | ReferralService → Prisma | ✅ PG |
| T-56 | getUpsellOpportunities | UpsellService → Prisma | ✅ PG |
| T-57 | createUpsellOffer | UpsellService → Prisma | ✅ PG |
| T-60 | trackGrowthExperiment | ExperimentService → Prisma | ✅ PG |
| T-61 | createGrowthExperiment | ExperimentService → Prisma | ✅ PG |
| T-62 | getCampaignPerformance | MarketingAnalyticsService → Prisma | ✅ PG |
| T-63 | createMarketingCampaign | CampaignService → Prisma | ✅ PG |
| T-64 | getAudienceSegments | AudienceService → Prisma | ✅ PG |
| T-65 | createAudienceSegment | AudienceService → Prisma | ✅ PG |
| T-66 | getContentCalendar | ContentService → Prisma | ✅ PG |
| T-67 | scheduleContent | ContentService → Prisma | ✅ PG |
| T-71 | getCompetitorIntelligence | CompetitorIntelligenceService → Prisma | ✅ PG |

**Total: 43 tools fully PostgreSQL-backed**

---

### ERPNext Bridge Tools (Require Migration for Full Independence)

| Tool ID | Tool Name | Current ERP Method | PostgreSQL Alternative Needed |
|---------|-----------|-------------------|------------------------------|
| T-04 | createMember | MEMBER_CREATE | MemberService.create() |
| T-07 | getPublicEventList | EVENT_LIST | StudioEvent queries |
| T-08 | getPublicClassSchedule | SCHEDULE_LIST | StudioClass queries |
| T-09 | getActivePlansPublic | MEMBERSHIP_LIST | StudioMembership queries |
| T-10 | captureLead | LEAD_CREATE | StudioLead create |
| T-11 | getEligibleSchedule | SCHEDULE_LIST | StudioClass + StudioMembership |
| T-12 | getAvailability | BOOKING_LIST | StudioBooking + StudioClass |
| T-13 | getMemberPlanEntitlement | MEMBERSHIP_GET | StudioMembership queries |
| T-13A | createBooking | wellness_studio.api.booking.book_by_schedule | StudioBooking create |
| T-13B | cancelBooking | BOOKING_CANCEL | StudioBooking update |
| T-13C | getMyBookings | BOOKING_LIST | StudioBooking queries |
| T-14 | getMemberGoalAndLevel | MEMBER_GET | StudioMember queries |
| T-15 | getMemberAttendanceSummary | ATTENDANCE_LIST | StudioAttendance + StudioBooking |
| T-16 | getEligibleSessionsForRecommendation | SCHEDULE_LIST | StudioClass + StudioBooking |
| T-72 | getRevenueSummary | REPORT_REVENUE_SUMMARY | StudioPayment aggregation |
| T-73 | getRevenueTrends | REPORT_REVENUE_TRENDS | StudioPayment time-series |

**Total: 17 tools requiring PostgreSQL implementation**

---

## Migration Priority Matrix

### Priority 1: Core Member & Booking Flows (P0)
These are the most critical for daily operations.

| Tool | Current ERP Method | PostgreSQL Implementation Plan |
|------|-------------------|-------------------------------|
| T-04 createMember | MEMBER_CREATE | Use `MembersService.create()` with StudioMember + StudioMembership |
| T-13A createBooking | wellness_studio.api.booking.book_by_schedule | Use `BookingsService.create()` with capacity check |
| T-13B cancelBooking | BOOKING_CANCEL | Update StudioBooking status + handle waitlist promotion |
| T-13C getMyBookings | BOOKING_LIST | Query StudioBooking with memberId filter |
| T-13 getMemberPlanEntitlement | MEMBERSHIP_GET | Query StudioMembership with memberId |
| T-13C getMyBookings | BOOKING_LIST | Query StudioBooking with memberId |

**Effort:** 3-5 days  
**Dependencies:** MembersService, BookingsService, MembershipsService (exist)

---

### Priority 2: Public Enquiry & Schedule (P1)

| Tool | Current ERP Method | PostgreSQL Implementation Plan |
|------|-------------------|-------------------------------|
| T-07 getPublicEventList | EVENT_LIST | Query StudioEvent with isPublic=true, startAt > now |
| T-08 getPublicClassSchedule | SCHEDULE_LIST | Query StudioClass with status=Scheduled, date >= today |
| T-09 getActivePlansPublic | MEMBERSHIP_LIST | Query StudioMembership with active=true |
| T-10 captureLead | LEAD_CREATE | Use LeadsService.create() with source=AI_ENQUIRY |
| T-11 getEligibleSchedule | SCHEDULE_LIST | Join StudioClass + StudioMembership for member |
| T-12 getAvailability | BOOKING_LIST | Count StudioBooking per StudioClass, compare to capacity |
| T-13C getMyBookings | BOOKING_LIST | StudioBooking query with memberId |

**Effort:** 2-3 days  
**Dependencies:** EventsService, ClassesService, LeadsService (exist)

---

### Priority 3: Member Profile & Recommendations (P1)

| Tool | Current ERP Method | PostgreSQL Implementation Plan |
|------|-------------------|-------------------------------|
| T-14 getMemberGoalAndLevel | MEMBER_GET | Query StudioMember.goal, StudioMember.level |
| T-15 getMemberAttendanceSummary | ATTENDANCE_LIST | Count StudioAttendance by category |
| T-16 getEligibleSessionsForRecommendation | SCHEDULE_LIST | RecommendationsService (exists) |

**Effort:** 1-2 days  
**Dependencies:** MembersService, AttendanceService, RecommendationsService (exist)

---

### Priority 4: Revenue & Analytics (P2)

| Tool | Current ERP Method | PostgreSQL Implementation Plan |
|------|-------------------|-------------------------------|
| T-72 getRevenueSummary | REPORT_REVENUE_SUMMARY | Aggregate StudioPayment by date range, type, status |
| T-73 getRevenueTrends | REPORT_REVENUE_TRENDS | Time-series aggregation of StudioPayment |

**Effort:** 2-3 days  
**Dependencies:** PaymentsService, StudioInsightsService (partially exist)

---

## Implementation Approach

### Phase 1: Service Layer Implementation
For each ERPNext-bridged tool, create a PostgreSQL-first service method:

```typescript
// Example: createMember PostgreSQL implementation
async createMember(context: ToolContext, args: CreateMemberArgs): Promise<ToolResult> {
  const member = await this.membersService.create({
    tenantId: context.tenantId,
    fullName: args.fullName,
    phone: args.phone,
    email: args.email,
    planId: args.planId,
    startDate: args.startDate,
  });
  return { success: true, data: member };
}
```

### Phase 2: Tool Class Migration
Update tool classes to use PostgreSQL service instead of ERPNext:

```typescript
// Before (ERPNext bridge)
async execute(context: ToolContext, args: any): Promise<ToolResult> {
  return this.callErp(context, ERP_METHODS.MEMBER_CREATE, args);
}

// After (PostgreSQL-first)
async execute(context: ToolContext, args: any): Promise<ToolResult> {
  const result = await this.membersService.create(context, args);
  return { success: true, data: result };
}
```

### Phase 3: ERPNext Bridge as Fallback
Keep ERPNext bridge for optional synchronization:

```typescript
async execute(context: ToolContext, args: any): Promise<ToolResult> {
  // 1. Try PostgreSQL first
  try {
    const result = await this.membersService.create(context, args);
    return { success: true, data: result, source: 'postgresql' };
  } catch (pgError) {
    // 2. Fallback to ERPNext if configured
    if (this.erpService) {
      return this.callErp(context, ERP_METHODS.MEMBER_CREATE, args);
    }
    throw pgError;
  }
}
```

---

## Testing Strategy for ERPNext Independence

### Test Matrix

| Test Scenario | Tools Tested | Expected Result |
|---------------|--------------|-----------------|
| ERPNext unavailable, all tools work | All 17 migrated tools | ✅ Pass |
| ERPNext unavailable, member creation | T-04 | ✅ Pass |
| ERPNext unavailable, booking flow | T-13A, T-13B, T-12 | ✅ Pass |
| ERPNext unavailable, public enquiry | T-07, T-08, T-09, T-10 | ✅ Pass |
| ERPNext unavailable, member profile | T-14, T-15, T-16 | ✅ Pass |
| ERPNext unavailable, revenue | T-72, T-73 | ✅ Pass |
| ERPNext available, sync verification | All | Optional |

### Test Commands

```bash
# Run with ERPNext disabled
ERPNEXT_URL= ERPNEXT_API_KEY= ERPNEXT_API_SECRET= npm run test

# Specific test suites for ERPNext independence
npm run test -- --testPathPattern="erp-independence"
npm run test -- --testPathPattern="member-creation|booking|public-enquiry"
```

---

## Rollback Plan

If PostgreSQL implementation has issues:

1. **Feature flag** per tool: `erpnext_fallback_enabled=true` forces ERPNext bridge
2. **Gradual migration:** Migrate one tool at a time, verify, then next
3. **Monitoring:** Track `source: 'postgresql' | 'erpnext'` in tool results
4. **Rollback:** Set feature flag to force ERPNext for problematic tools

---

## Verification Checklist

### Pre-Migration
- [ ] All 17 ERPNext-bridged tools identified
- [ ] PostgreSQL service methods exist or created
- [ ] Unit tests for each PostgreSQL service method
- [ ] Integration tests with mocked Prisma

### Migration
- [ ] Migrate T-04 createMember (highest priority)
- [ ] Migrate T-13A/T-13B createBooking/cancelBooking
- [ ] Migrate T-07/T-08/T-09/T-10 public enquiry tools
- [ ] Migrate T-11/T-12/T-13C schedule/availability tools
- [ ] Migrate T-14/T-15/T-16 member profile tools
- [ ] Migrate T-72/T-73 revenue tools

### Post-Migration
- [ ] Run full test suite with ERPNext disabled
- [ ] Verify all 12 agents functional without ERPNext
- [ ] Load test critical paths (booking, member creation)
- [ ] Document any tools still requiring ERPNext

---

## Rollback Criteria

If any of the following occur, pause migration and rollback:
- Data inconsistency between PostgreSQL and ERPNext
- Performance degradation > 2x
- Booking conflicts or double-bookings
- Member data loss or corruption
- Test suite failures > 5%

---

## Success Criteria

**ERPNext Independence Achieved When:**
1. ✅ All 17 migrated tools work without ERPNext
2. ✅ All 12 agents functional without ERPNext
3. ✅ Core workflows pass: member creation, booking, public enquiry, revenue
4. ✅ Test suite passes with ERPNext environment variables unset
5. ✅ No tool has hard dependency on ERPNext for core operation
6. ✅ ERPNext is purely optional for synchronization

---

## Timeline

| Phase | Duration | Milestone |
|-------|----------|-----------|
| Priority 1 (Member/Booking) | Week 1 | Core operations independent |
| Priority 2 (Public/Schedule) | Week 2 | Public enquiry & scheduling independent |
| Priority 3 (Member Profile) | Week 2 | Recommendations & profile independent |
| Priority 4 (Revenue) | Week 3 | Analytics independent |
| Testing & Verification | Week 3-4 | Full ERPNext-free test pass |
| **Total** | **3-4 weeks** | **Full ERPNext Independence** |

---

*This document tracks the path to full PostgreSQL-first operation. Update as migration progresses.*