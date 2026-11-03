# Full-Stack Integration Progress

## Phase 1: Backend - Connect GET endpoints to Prisma (IMPORT_STORE=postgres) [DONE]
- All 8 GET list endpoints use Prisma when IMPORT_STORE=postgres:
  - MembersService.list() → studioMember table ✅
  - LeadsService.list() → studioLead table ✅
  - ClassesService.list() → studioClass table ✅
  - MembershipsService.list() → studioMembership table ✅
  - BookingsService.list() → studioBooking table ✅
  - AttendanceService.list() → studioAttendance table ✅
  - PaymentsService.findAll() → studioPayment table ✅
  - EventsService.list() → studioEvent table ✅
- PaymentsService constructor updated with ErpnextService + PrismaService
- Import/Export module already supports IMPORT_STORE=erp|postgres switch
- Backend typecheck: clean
- Backend tests: 65 suites pass, 669 tests pass (3 pre-existing DB infra failures - NOT regressions)

## Phase 2: Frontend - Rewrite AdminDataProvider to fetch from API [DONE]
- Removed all initial* mock arrays (initialLeads, initialMembers, etc.)
- Replaced usePreviewState(localStorage) with useState + API calls
- Fetches all 8 datasets from backend on mount via refresh()
- Added refresh() function exposed via context (includes memberships)
- Added loading/error states
- AdminDataProvider no longer imports from studioEvents (DEFAULT_STUDIO_EVENTS no longer used as data source)
- Frontend typecheck: clean
- Frontend tests: 74/74 pass
- Frontend build: successful (61 routes)

## Phase 3: Import/Export Page - Connect to backend with refresh [DONE]
- Import/Export page now supports all 8 import types (was only 3: Members, Leads, Classes)
- Expanded StudioImportType to include: Memberships, Bookings, Attendance, Payments, Events
- Added sample CSV templates for all 8 types
- Added client-side validation logic for all 8 types in parsedPreview
- Added expectedImportColumns for all 8 types
- Updated applyImport() to call API for all 8 types instead of throwing error
- After successful import, calls refresh() so imported records appear across all pages
- Error handling with try/catch and error toasts
- File auto-detection updated for all 8 types
- Added buildMixedSample fallbacks for remaining import types

## Phase 4: Remove remaining mock data [PARTIAL - IMPORT/EXPORT ONLY]
- AdminDataProvider.tsx: All mock arrays removed ✅
- ImportExportPage (AdminWorkspacePages.tsx): No longer mutates local state for import ✅
- Other pages still have local-only mutations (pre-existing, not rewritten per "Do not rewrite working code"):
  - AdminDashboard.tsx: createMember, createBooking, createPayment, etc.
  - AdminClassOperations.tsx: markAttendance, createClass, cancelClass, etc.
  - AdminStaffPage.tsx: localStorage for staff data
  - AdminEventOperations.tsx: createEvent, cancelEvent, etc.
  - AdminFeedbackPage.tsx: localStorage for feedback
  - AdminTrainersPage.tsx: localStorage for deleted trainers

## Phase 5: Backend RLS and Security [VERIFIED]
- All Prisma queries use withTenant() for tenant-scoped RLS
- RLS policies use tenant_id = platform.current_tenant()
- Import operations are audited before execution (audit.started) and after (import.completed)
- Idempotency key support prevents duplicate imports

## Test Results Summary
| Check | Result |
|-------|--------|
| Backend typecheck | ✅ Pass |
| Backend tests | 65 suites pass, 669 tests pass (3 pre-existing DB infra failures) |
| Frontend typecheck | ✅ Pass |
| Frontend tests | 74 suites, 74 tests - all pass |
| Frontend build | ✅ 61 routes generated successfully |

## Remaining Gaps (not regressions, pre-existing)
1. **E2E verification blocked**: No PostgreSQL database or running backend available
   - Cannot run `scripts/import-data-folder.ts` or verify live DB persistence
   - Cannot verify dashboard metrics reflect imported data
   - Cannot test malformed CSVs, duplicate rows, unauthorized access live
2. **Other admin pages use local-only mutations** (pre-existing, not part of import/export scope):
   - AdminDashboard.tsx: local state for members, bookings, payments, classes, events
   - AdminClassOperations.tsx: local state for attendance, classes, bookings
  AdminStaffPage.tsx: localStorage for staff
   - AdminEventOperations.tsx: local state for events
   - AdminFeedbackPage.tsx: localStorage for feedback
   - AdminTrainersPage.tsx: localStorage for deleted trainers
3. **ERP mode vs Postgres mode**: ERP mode writes to external ERPNext (requires FRAPPE_API_KEY); Postgres mode writes to Prisma studio_* tables. Both are supported but ERP mode requires external infrastructure.

## Files Changed
**Backend:**
- backend-nestjs-gateway/src/modules/members/members.service.ts - list() uses Prisma
- backend-nestjs-gateway/src/modules/leads/leads.service.ts - list() uses Prisma
- backend-nestjs-gateway/src/modules/classes/classes.service.ts - list() uses Prisma
- backend-nestjs-gateway/src/modules/memberships/memberships.service.ts - list() uses Prisma
- backend-nestjs-gateway/src/modules/bookings/bookings.service.ts - list() uses Prisma
- backend-nestjs-gateway/src/modules/attendance/attendance.service.ts - list() uses Prisma
- backend-nestjs-gateway/src/modules/payments/payments.service.ts - findAll() uses Prisma, constructor updated
- backend-nestjs-gateway/src/modules/events/events.service.ts - list() uses Prisma

**Frontend:**
- frontend-nextjs/src/app/admin/_components/AdminDataProvider.tsx - Complete rewrite: API-based data fetching, refresh() includes all 8 datasets
- frontend-nextjs/src/app/admin/_components/AdminWorkspacePages.tsx - Import/Export page supports all 8 types, applyImport uses API + refresh()
- frontend-nextjs/src/lib/api-client/index.ts - Added getMemberships, getLeads, getBookings, getAttendance, getPayments, getEvents read methods; all 8 import methods

**Restored:**
- AGENTS.md - Restored (was incorrectly deleted)

## Import/Export Endpoint Status (all 8 entities)
| Dataset | Import Endpoint | Backend Persistence | List Endpoint | Frontend Read | UI Import Support |
|---------|----------------|---------------------|---------------|---------------|-------------------|
| Members | POST /import-export/import/members | Prisma studio_members | GET /members | ✅ ApiClient.getMembers | ✅ |
| Leads | POST /import-export/import/leads | Prisma studio_leads | GET /leads | ✅ ApiClient.getLeads | ✅ |
| Classes | POST /import-export/import/classes | Prisma studio_classes | GET /classes | ✅ ApiClient.getClasses | ✅ |
| Memberships | POST /import-export/import/memberships | Prisma studio_memberships | GET /memberships | ✅ ApiClient.getMemberships | ✅ |
| Bookings | POST /import-export/import/bookings | Prisma studio_bookings | GET /bookings | ✅ ApiClient.getBookings | ✅ |
| Attendance | POST /import-export/import/attendance | Prisma studio_attendance | GET /attendance | ✅ ApiClient.getAttendance | ✅ |
| Payments | POST /import-export/import/payments | Prisma studio_payments | GET /payments | ✅ ApiClient.getPayments | ✅ |
| Events | POST /import-export/import/events | Prisma studio_events | GET /events | ✅ ApiClient.getEvents | ✅ |

## CSV Header Mapping
All Data/ folder CSV headers match the corresponding DTO contracts:
- members.csv: name,email,phone,plan,status,joined,expiry,coach → ImportMemberDto ✅
- leads.csv: name,email,phone,source,stage,followUpDate,assigned,plan,notes → ImportLeadDto ✅
- classes.csv: name,category,date,startTime,endTime,trainer,room,capacity,status → ImportClassDto ✅
- memberships.csv: name,planType,priceINR,sessionLimit → ImportMembershipDto ✅
- bookings.csv: classId,memberId,status,bookedAt → ImportBookingDto ✅
- attendance.csv: bookingId,status,checkedInAt → ImportAttendanceDto ✅
- payments.csv: ref,date,memberId,type,method,status,amount,refundedAmount,notes → ImportPaymentDto ✅
- events.csv: title,category,startAt,endAt,venue,organizer,capacity → ImportEventDto ✅

No header mismatches.

## Run Instructions
Backend: cd backend-nestjs-gateway && IMPORT_STORE=postgres TEST_DATABASE_URL="postgresql://..." npx start
Frontend: cd frontend-nextjs && NEXT_PUBLIC_API_URL=http://localhost:3001 npx dev
Then navigate to http://localhost:3000/admin/import-export and upload a CSV.

## Blockers (require infrastructure)
- No PostgreSQL database available for live verification
- No ERPNext instance available (FRAPPE_API_KEY empty in .env)
- Cannot run scripts/import-data-folder.ts or verify DB counts
- Cannot verify end-to-end: CSV upload → DB persistence → frontend display