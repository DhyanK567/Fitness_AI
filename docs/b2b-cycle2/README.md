# Wellness Studio OS — Cycle 2 B2B Division

## Automated Trainer Morning Class Roster & Studio Floor Capacity Alerts

**Engineering Lead:** Syed Tahir Ahamed
**Sprint:** Cycle 2 (B2B Division)
**Target:** Attendance & Studio Floor Operations

---

## 1. Overview & Business Objectives

Cycle 2 expands the Wellness Studio OS platform from client-facing features into high-impact B2B studio automation. It delivers two foundational capabilities:

1. **Sub-Track 1: Automated Trainer Morning Class Roster (Task 2.3)**
   - Delivers an actionable, personalized WhatsApp briefing to every active fitness coach at **06:30 AM IST** daily.
   - Summarizes daily schedules, session times, studio room assignments, and confirmed attendance.
   - Highlights critical client medical/injury conditions (`knee_injury`, `lower_back_pain`, `post_surgery`) and onboarding status (`first_time_member`) so trainers can adapt programming safely.

2. **Sub-Track 2: Studio Floor Capacity & Surge Alert System (Task 2.4)**
   - Proactively prevents floor overcrowding and mitigates under-attended sessions.
   - Dispatches real-time Front Desk alerts when class bookings cross key capacity thresholds:
     - **90% Capacity Surge (`SURGE_90`)**: Alerts desk staff to prepare extra equipment (mats, bands, barbells).
     - **100% Sold Out (`FULL_100`)**: Alerts desk staff to open waitlists or prepare overflow management.
     - **4-Hour Low Occupancy (`LOW_ATTENDANCE`)**: Warns staff 4 hours prior if a session has fewer than 3 bookings to launch marketing pushes or reallocate instructors.
   - Transmits notifications simultaneously via **Server-Sent Events (SSE)** to `/api/v1/front-desk/events` and through the WhatsApp transactional outbox.

---

## 2. Team Work Allocation & File Ownership Matrix

Per `B2B_Cycle2_Team_Work_Distribution.pdf`, responsibility is divided across three developers:

| Member | Focus Area | Assigned Features | Key Files Owned |
| :--- | :--- | :--- | :--- |
| **Developer A** | Roster Data Pipeline & Scheduler | F1, F2, F3, F4, F17 (Tenant Isolation) | `backend-worker/src/schedulers/trainer-roster/trainer-roster.scheduler.ts`<br>`backend-worker/src/trainer-roster/trainer-roster.service.ts`<br>`backend-worker/src/types/roster.types.ts` |
| **Developer B** | Capacity Engine, 4-Hour Monitor & Delivery Layer | F7, F9, F12, F14, F15, F16, F17 | `backend-worker/src/services/floor-alert.service.ts`<br>`backend-worker/src/schedulers/studiocapacity.scheduler.ts`<br>`backend-worker/src/types/floor-alert.types.ts`<br>`backend-worker/src/outbox-dispatcher/` |
| **Developer C** | Message Builders, Health Flags, Simulation, Tests & Docs | F5, F6, F8, F10/F11/F13 (Message Text), Docs | `backend-worker/src/services/health-flags.mapper.ts`<br>`backend-worker/src/formatters/trainer-briefing.formatter.ts`<br>`backend-worker/src/formatters/floor-alert-message.ts`<br>`backend-worker/src/simulate/roster.fixture.ts`<br>`backend-worker/src/simulate/roster.simulate.ts`<br>`docs/b2b-cycle2/` |

---

## 3. Developer C Architecture & Pure Function Core

Developer C delivers zero-side-effect, pure TypeScript business logic that guarantees deterministic outputs and enables 100% offline testing without live database dependencies:

```
+-----------------------------------+
|     Health Profile Input          |
|  (firstTimeMember, kneeInjury,    |
|   lowerBackPain, postSurgery)     |
+-----------------+-----------------+
                  |
                  v
+-----------------------------------+
|      mapHealthFlags()             |  --> ClientNote[]
| (health-flags.mapper.ts)          |      (standard coaching advice)
+-----------------+-----------------+
                  |
                  v
+-----------------------------------+
|    formatTrainerBriefing()        |  --> Personalized WhatsApp Briefing
| (trainer-briefing.formatter.ts)   |      (IST date, sessions, notes, badges)
+-----------------------------------+

+-----------------------------------+
|     FloorAlertContext             |
| (SURGE_90, FULL_100,              |
|  LOW_ATTENDANCE)                  |
+-----------------+-----------------+
                  |
                  v
+-----------------------------------+
|   buildFloorAlertMessage()        |  --> Front Desk Alert Text
| (floor-alert-message.ts)          |      (capacity surge & low attendance)
+-----------------------------------+
```

---

## 4. Local Verification & Simulation Commands

### A. Run Roster Simulation (Dry-Run Mode)
The simulation renders sample briefings to the console using comprehensive fixtures. It is guaranteed safe: zero database writes, zero Outbox rows, and zero WhatsApp dispatches.

```bash
# Execute simulation from backend-worker workspace
pnpm --filter @fitness-ai/backend-worker exec tsx src/simulate/roster.simulate.ts

# Execute simulation with specific target date (IST)
pnpm --filter @fitness-ai/backend-worker exec tsx src/simulate/roster.simulate.ts 2026-11-15
```

### B. Run Backend Worker Test Suite
```bash
# Run all unit, integration, and snapshot tests
pnpm --filter @fitness-ai/backend-worker test

# Run Developer C tests specifically
pnpm --filter @fitness-ai/backend-worker test -- src/services/health-flags.mapper.spec.ts src/formatters/ src/simulate/
```

### C. Run TypeScript Check
```bash
pnpm --filter @fitness-ai/backend-worker exec tsc --noEmit
```

---

## 5. Combined B2B Definition of Done (DoD) Checklist

| Item | Requirement | Status | Verified By |
| :---: | :--- | :---: | :--- |
| **1** | Trainer schedule queries correctly filter by tenant and active status | ✅ | Developer A (`trainer-roster.service.spec.ts`) |
| **2** | Tri-state health flags (`knee_injury`, `lower_back_pain`, `post_surgery`, `first_time_member`) map to coaching notes | ✅ | Developer C (`health-flags.mapper.spec.ts`) |
| **3** | WhatsApp briefing renders schedule, icons, sold-out indicators, and client notes in exact guide format | ✅ | Developer C (`trainer-briefing.formatter.spec.ts`, snapshots) |
| **4** | Capacity surge and full alerts trigger with exact guide wording and spot percentages | ✅ | Developer C (`floor-alert-message.spec.ts`) |
| **5** | Low attendance alert fires 4 hours before class when bookings < 3 | ✅ | Developer B / C (`floor-alert-message.spec.ts`) |
| **6** | Offline `--simulate` mode renders full rosters to stdout without creating Outbox messages | ✅ | Developer C (`roster.simulate.spec.ts`) |
| **7** | End-to-end multi-class text formatting integration verified | ✅ | Developer C (`roster-multiclass.integration.spec.ts`) |
| **8** | Tenant isolation preserved across all models and queries | ✅ | Developer A / B |
| **9** | Existing frontend UI, B2C booking flows, and API compatibility unchanged | ✅ | All Developers |
| **10** | Zero new dependencies added; no database schema resets | ✅ | All Developers |

---

## 6. Integration Dependencies & Branch Merge Order

Per the Cycle 2 team plan, the pull request sequence ensures smooth rebases without merge conflicts:

1. **Contracts PR (Day 1)**: `roster.types.ts` & `floor-alert.types.ts` merged to establish shared types.
2. **Member A PR (`feature/c2-b2b-trainer-roster`)**: Merged (commit `e29cbf9`). Provides `TrainerRosterService` and `TrainerRosterScheduler`.
3. **Member C PR (`feature/c2-b2b-messages-sim`)**: **[CURRENT]** Delivers health-flags mapper, briefing formatter, floor alert message builder, fixtures, snapshot tests, dry-run simulation, and documentation.
4. **Member B PR (`feature/c2-b2b-capacity-alerts`)**: Plugs Developer C's message templates into `FloorAlertService` and wires Outbox deduplication and SSE feeds.
