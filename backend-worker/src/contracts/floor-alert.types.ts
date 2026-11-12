/**
 * Shared Cycle 2 B2B Floor Capacity & Low-Attendance Alert Contracts
 * Owner: Developer B (F9, F10, F11, F13, F14, F15, F16, F17)
 *
 * Compatible with Developer C's `buildFloorAlertMessage(ctx: FloorAlertContext): string`
 * formatter and reusable with existing `OutboxEvent` and `OperationalAlert` models.
 */

export const FLOOR_ALERT_TYPES = {
  SURGE_90: 'SURGE_90',
  FULL_100: 'FULL_100',
  LOW_ATTENDANCE_4H: 'LOW_ATTENDANCE_4H',
} as const;

export type FloorAlertType =
  (typeof FLOOR_ALERT_TYPES)[keyof typeof FLOOR_ALERT_TYPES];

/** Matches `ai.operational_alerts.severity` values ('info' | 'warning' | 'critical'). */
export type FloorAlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Input context passed to Developer C's `buildFloorAlertMessage(ctx)` formatter
 * and produced by Developer B's capacity engine (`FloorAlertService`).
 *
 * Note: Core required fields match Section 6 of B2B_Cycle2_Team_Work_Distribution.pdf;
 * optional fields provide studio metadata without breaking simple formatter callers.
 */
export interface FloorAlertContext {
  tenantId: string;
  classId: string;
  type: FloorAlertType;
  className: string;
  startTime: Date;
  booked: number;
  capacity: number;
  waitlisted?: number;
  occupancyPct?: number;
  roomName?: string | null;
  trainerName?: string | null;
  minutesUntilStart?: number;
  severity?: FloorAlertSeverity;
}

/** Formatter function signature implemented by Developer C (`buildFloorAlertMessage`). */
export type FloorAlertMessageBuilder = (ctx: FloorAlertContext) => string;

/** Fully built alert object ready for dedup, persistence, outbox enqueue, and SSE dispatch. */
export type FloorAlert = FloorAlertContext & {
  message: string;
  dedupKey: string;
  title?: string;
  createdAt?: string;
};

/** Capacity engine evaluation snapshot returned by `FloorAlertService` (`F9`). */
export interface ClassCapacitySnapshot {
  tenantId: string;
  classId: string;
  className: string;
  startTime: Date;
  capacity: number;
  confirmedCount: number;
  waitlistedCount: number;
  occupancyPct: number;
  minutesUntilStart?: number;
}

export interface FloorAlertEvaluationResult {
  evaluated: boolean;
  skippedReason?:
    | 'CLASS_NOT_FOUND'
    | 'CLASS_CANCELLED'
    | 'INVALID_CAPACITY'
    | 'OUTSIDE_WINDOW';
  snapshot?: ClassCapacitySnapshot;
  triggeredAlerts: FloorAlert[];
  deduplicatedTypes: FloorAlertType[];
}

/** Outbox event payload persisted in `ops.outbox_events` (`F14`, `F17`). */
export interface FloorAlertOutboxPayload {
  tenantId: string;
  alertType: FloorAlertType;
  severity: FloorAlertSeverity;
  classId: string;
  className: string;
  startTimeIso: string;
  booked: number;
  capacity: number;
  waitlisted: number;
  occupancyPct: number;
  message: string;
  dedupKey: string;
  operationalAlertId?: string;
}

/**
 * Tenant-scoped SSE payload published over Redis Pub/Sub (`front-desk:events:{tenantId}`)
 * and emitted additively on the Front Desk SSE stream (`F15`, `F17`).
 */
export interface FloorAlertSseEvent {
  eventType: 'floor_capacity_alert';
  tenantId: string;
  alertType: FloorAlertType;
  severity: FloorAlertSeverity;
  classId: string;
  className: string;
  startTimeIso: string;
  booked: number;
  capacity: number;
  waitlisted: number;
  occupancyPct: number;
  message: string;
  dedupKey: string;
  timestamp: string;
}
