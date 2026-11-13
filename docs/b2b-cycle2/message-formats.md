# Cycle 2 B2B — Message Formats & Translation Contracts

This document specifies the exact string formatting contracts, templating rules, and health flag coaching translations for Cycle 2 B2B messaging.

---

## 1. Trainer Morning Briefing (Task F6)

The trainer morning briefing is dispatched via WhatsApp daily at 06:30 AM IST. It provides instructors with a concise, high-energy summary of their daily commitments and vital client safety notes.

### Layout Specification

```text
🌅 Good morning Coach {trainerName}! Here is your schedule for today ({DayOfWeek}, {Month} {Day}):

{icon} Session {N}: {Time} - {ClassName} ({RoomName})
👥 Attendance: {Confirmed}/{Capacity} {Confirmed | (SOLD OUT)}
⚠️ Important Client Notes:
• {MemberName} ({CoachingNote})

Have a high-energy day on the floor!
```

### Complete Reference Example

```text
🌅 Good morning Coach Marcus! Here is your schedule for today (Wednesday, Nov 12):

🏋️ Session 1: 07:00 AM - Strength & Conditioning (Main Floor)
👥 Attendance: 12/15 Confirmed
⚠️ Important Client Notes:
• Priya Sharma (First-timer, introduce gym layout)
• Rahul Mehta (Recovering from lumbar strain — avoid heavy deadlifts)

🧘 Session 2: 05:30 PM - Core & Mobility (Studio B)
👥 Attendance: 18/18 (SOLD OUT)

Have a high-energy day on the floor!
```

### Formatting Rules & Constraints

1. **Greeting:**
   - Always prefixed with `🌅 Good morning Coach {trainerName}!`.
   - If `trainerName` already begins with "Coach", the title is not duplicated (e.g. `Coach Marcus`, not `Coach Coach Marcus`).
2. **Date Format:**
   - Displayed in IST calendar time: `({DayOfWeek}, {ShortMonth} {Day})` (e.g., `(Wednesday, Nov 12)`).
3. **Session Categorization Icons:**
   - `🧘` for Yoga, Mobility, Pilates, Core, Stretch.
   - `🥊` for Boxing, Kickboxing, Combat, MMA, HIIT.
   - `🚴` for Cycling, Spin, Bike.
   - `🏃` for Running, Treadmill, Cardio.
   - `🏋️` for Strength, Conditioning, Weights, or general fitness.
4. **Attendance Line:**
   - Normal capacity: `👥 Attendance: {confirmed}/{capacity} Confirmed`.
   - Sold out (`confirmed >= capacity` or `soldOut === true`): `👥 Attendance: {confirmed}/{capacity} (SOLD OUT)`.
5. **Client Medical / Safety Notes:**
   - The `⚠️ Important Client Notes:` block is rendered **only** when at least one note exists for that session.
   - Each note is bulleted using `• {MemberName} ({NoteText})`.
6. **Empty Days:**
   - When a trainer has no scheduled sessions (`sessions.length === 0`), `formatTrainerBriefing()` returns an empty string `""` to prevent dispatching empty messages.

---

## 2. Health & Injury Flag Mapping (Task F5)

Member health profiles are mapped to actionable coaching modifications via `mapHealthFlags(profile)`.

### Field Mapping Matrix

| Database / Profile Field | Note Kind | Standard Coaching Directive |
| :--- | :--- | :--- |
| `first_time_member`<br>`firstTimeMember` | `FIRST_TIMER` | `First-timer, introduce gym layout` |
| `knee_injury`<br>`kneeInjury` | `KNEE_INJURY` | `Knee injury: avoid or modify exercises that strain the knee` |
| `lower_back_pain`<br>`lowerBackPain` | `LOWER_BACK` | `Lower-back condition: avoid heavy deadlifts and adapt exercises` |
| `post_surgery`<br>`postSurgery` | `POST_SURGERY` | `Post-surgery: follow appropriate recovery-related coaching precautions` |

### Tri-State Evaluation Semantics

- Only flags evaluated strictly as `true` (or string `'true'`) trigger note generation.
- Values of `false`, `null`, `undefined`, or omitted fields produce zero notes.
- If a member has multiple flags active, all corresponding notes are generated.
- Custom coaching text (such as clinical notes entered by staff, e.g. *"Recovering from lumbar strain — avoid heavy deadlifts"*) is fully preserved when present.

---

## 3. Studio Floor Capacity Alert Templates (Task F8)

Floor alerts are delivered to the Front Desk Action Center via Server-Sent Events (SSE) and WhatsApp outbox notifications.

### Canonical Templates

```typescript
export const FLOOR_ALERT_TEMPLATES = {
  SURGE_90: (className, time, pct, booked, capacity) =>
    `Capacity Surge: ${className} at ${time} is now ${pct}% full (${booked}/${capacity} spots).\nPrepare additional equipment.`,

  FULL_100: (className, time, booked, capacity) =>
    `Class Full: ${className} at ${time} is now 100% full (${booked}/${capacity}).\nConsider opening a waitlist.`,

  LOW_ATTENDANCE: (className, time, booked) =>
    `Low Attendance: ${className} at ${time} has only ${booked} booking(s) and starts in 4 hours.\nLaunch an instant waitlist push or confirm trainer availability.`,
};
```

### Examples by Scenario

#### Scenario A: 90%–95% Capacity Surge (`SURGE_90`)
> **Trigger:** Confirmed bookings reach or exceed 90% of studio room capacity.
> **Output:**
> ```text
> Capacity Surge: HIIT at 06:00 PM is now 95% full (19/20 spots).
> Prepare additional equipment.
> ```

#### Scenario B: 100% Class Full (`FULL_100`)
> **Trigger:** Confirmed bookings reach 100% of studio room capacity.
> **Output:**
> ```text
> Class Full: Spin Revolution at 07:00 PM is now 100% full (25/25).
> Consider opening a waitlist.
> ```

#### Scenario C: Low Attendance 4-Hour Warning (`LOW_ATTENDANCE` / `LOW_ATTENDANCE_4H`)
> **Trigger:** 4 hours prior to class start time, confirmed bookings are fewer than 3.
> **Output:**
> ```text
> Low Attendance: Sunrise Yoga at 06:00 AM has only 2 booking(s) and starts in 4 hours.
> Launch an instant waitlist push or confirm trainer availability.
> ```

---

## 4. TypeScript Signatures & Module Exports

```typescript
// backend-worker/src/services/health-flags.mapper.ts
export function mapHealthFlags(profile?: HealthProfileInput | null): ClientNote[];

// backend-worker/src/formatters/trainer-briefing.formatter.ts
export function formatTrainerBriefing(roster: TrainerRoster): string;

// backend-worker/src/formatters/floor-alert-message.ts
export function buildFloorAlertMessage(ctx: FloorAlertContext): string;

// backend-worker/src/simulate/roster.simulate.ts
export function runRosterSimulation(date?: string, customRosters?: TrainerRoster[], silent?: boolean): Promise<SimulationResult>;
```
