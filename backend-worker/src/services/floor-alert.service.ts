import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  ClassCapacitySnapshot,
  FLOOR_ALERT_TYPES,
  FloorAlert,
  FloorAlertContext,
  FloorAlertEvaluationResult,
  FloorAlertMessageBuilder,
  FloorAlertSeverity,
  FloorAlertType,
} from '../contracts/floor-alert.types';

const CANONICAL_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const SURGE_THRESHOLD_PCT = 90;
const DEFAULT_LOW_ATTENDANCE_THRESHOLD = 3;

export type InvalidScheduleReason = 'INVALID_CLASS_DATE' | 'INVALID_START_TIME';

export interface FloorAlertServiceEvaluationResult
  extends FloorAlertEvaluationResult {
  invalidScheduleReason?: InvalidScheduleReason;
}

export interface EvaluateClassOptions {
  /** Reference timestamp for 4-hour window checks (defaults to current time). */
  now?: Date;
  /**
   * When true, skips evaluation and returns OUTSIDE_WINDOW if the class
   * does not start within [0, 4 hours] from `now`.
   */
  requireFourHourWindow?: boolean;
  /** Minimum confirmed bookings threshold for low-attendance warning (default: 3). */
  lowAttendanceThreshold?: number;
  /** Optional formatter (e.g. Developer C's `buildFloorAlertMessage`). */
  messageBuilder?: FloorAlertMessageBuilder;
}

@Injectable()
export class FloorAlertService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate a single studio class within its tenant boundary for capacity surge
   * (`SURGE_90`, `FULL_100`) and 4-hour low-attendance (`LOW_ATTENDANCE_4H`) conditions.
   */
  async evaluateClass(
    tenantId: string,
    classId: string,
    options: EvaluateClassOptions = {},
  ): Promise<FloorAlertServiceEvaluationResult> {
    this.assertValidTenantId(tenantId);

    const normalizedClassId =
      typeof classId === 'string' ? classId.trim() : '';
    if (!normalizedClassId || !CANONICAL_UUID_REGEX.test(normalizedClassId)) {
      return {
        evaluated: false,
        skippedReason: 'CLASS_NOT_FOUND',
        triggeredAlerts: [],
        deduplicatedTypes: [],
      };
    }

    const now = options.now ?? new Date();
    const lowAttendanceThreshold =
      options.lowAttendanceThreshold ?? DEFAULT_LOW_ATTENDANCE_THRESHOLD;

    return this.prisma.withTenant(tenantId, async (tx) => {
      const studioClass = await tx.studioClass.findFirst({
        where: { id: normalizedClassId, tenantId },
        select: {
          id: true,
          tenantId: true,
          name: true,
          date: true,
          startTime: true,
          room: true,
          trainer: true,
          capacity: true,
          status: true,
        },
      });

      if (!studioClass) {
        return {
          evaluated: false,
          skippedReason: 'CLASS_NOT_FOUND',
          triggeredAlerts: [],
          deduplicatedTypes: [],
        };
      }

      if (this.isCancelledStatus(studioClass.status)) {
        return {
          evaluated: false,
          skippedReason: 'CLASS_CANCELLED',
          triggeredAlerts: [],
          deduplicatedTypes: [],
        };
      }

      if (!Number.isFinite(studioClass.capacity) || studioClass.capacity <= 0) {
        return {
          evaluated: false,
          skippedReason: 'INVALID_CAPACITY',
          triggeredAlerts: [],
          deduplicatedTypes: [],
        };
      }

      const resolvedStart = this.resolveClassStartDateTime(
        studioClass.date,
        studioClass.startTime,
      );
      if (!resolvedStart.ok) {
        return {
          evaluated: false,
          invalidScheduleReason: resolvedStart.reason,
          triggeredAlerts: [],
          deduplicatedTypes: [],
        };
      }

      const classStart = resolvedStart.startTime;
      const msUntilStart = classStart.getTime() - now.getTime();
      const minutesUntilStart = Math.round(msUntilStart / 60000);
      const isWithinFourHours = msUntilStart >= 0 && msUntilStart <= FOUR_HOURS_MS;

      if (options.requireFourHourWindow && !isWithinFourHours) {
        return {
          evaluated: false,
          skippedReason: 'OUTSIDE_WINDOW',
          triggeredAlerts: [],
          deduplicatedTypes: [],
        };
      }

      const bookings = await tx.studioBooking.findMany({
        where: { tenantId, classId: studioClass.id },
        select: { status: true },
      });

      let confirmedCount = 0;
      let waitlistedCount = 0;

      for (const booking of bookings) {
        const normalizedStatus = (booking.status || '').trim().toLowerCase();
        if (normalizedStatus === 'confirmed') {
          confirmedCount += 1;
        } else if (normalizedStatus === 'waitlisted') {
          waitlistedCount += 1;
        }
      }

      const occupancyPct = Number(
        ((confirmedCount / studioClass.capacity) * 100).toFixed(1),
      );

      const snapshot: ClassCapacitySnapshot = {
        tenantId,
        classId: studioClass.id,
        className: studioClass.name,
        startTime: classStart,
        capacity: studioClass.capacity,
        confirmedCount,
        waitlistedCount,
        occupancyPct,
        minutesUntilStart,
      };

      const alertTypes: FloorAlertType[] = [];

      if (confirmedCount >= studioClass.capacity) {
        alertTypes.push(FLOOR_ALERT_TYPES.FULL_100);
      } else if (
        confirmedCount * 100 >= studioClass.capacity * SURGE_THRESHOLD_PCT &&
        confirmedCount < studioClass.capacity
      ) {
        alertTypes.push(FLOOR_ALERT_TYPES.SURGE_90);
      } else if (
        isWithinFourHours &&
        confirmedCount < lowAttendanceThreshold
      ) {
        alertTypes.push(FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H);
      }

      const triggeredAlerts = alertTypes.map((alertType) =>
        this.buildAlert(
          {
            tenantId,
            classId: studioClass.id,
            type: alertType,
            className: studioClass.name,
            startTime: classStart,
            booked: confirmedCount,
            capacity: studioClass.capacity,
            waitlisted: waitlistedCount,
            occupancyPct,
            roomName: studioClass.room,
            trainerName: studioClass.trainer,
            minutesUntilStart,
            severity: this.resolveSeverity(alertType),
          },
          options.messageBuilder,
          now,
        ),
      );

      return {
        evaluated: true,
        snapshot,
        triggeredAlerts,
        deduplicatedTypes: [],
      };
    });
  }

  private assertValidTenantId(tenantId: string): void {
    if (!tenantId || !CANONICAL_UUID_REGEX.test(tenantId)) {
      throw new Error(
        'A canonical tenant UUID is required for tenant-scoped floor alert evaluation.',
      );
    }
  }

  private isCancelledStatus(status?: string | null): boolean {
    return (status || '').trim().toLowerCase() === 'cancelled';
  }

  private resolveSeverity(type: FloorAlertType): FloorAlertSeverity {
    switch (type) {
      case FLOOR_ALERT_TYPES.FULL_100:
        return 'critical';
      case FLOOR_ALERT_TYPES.SURGE_90:
        return 'warning';
      case FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H:
        return 'info';
    }
  }

  private buildAlert(
    context: FloorAlertContext,
    messageBuilder: FloorAlertMessageBuilder | undefined,
    now: Date,
  ): FloorAlert {
    const message = messageBuilder
      ? messageBuilder(context)
      : this.buildFallbackMessage(context);

    return {
      ...context,
      message,
      dedupKey: `floor-alert:${context.tenantId}:${context.classId}:${context.type}`,
      title: this.buildAlertTitle(context.type, context.className),
      createdAt: now.toISOString(),
    };
  }

  private buildAlertTitle(type: FloorAlertType, className: string): string {
    switch (type) {
      case FLOOR_ALERT_TYPES.FULL_100:
        return `Class Full: ${className}`;
      case FLOOR_ALERT_TYPES.SURGE_90:
        return `Capacity Surge: ${className}`;
      case FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H:
        return `Low Attendance Warning: ${className}`;
    }
  }

  private buildFallbackMessage(ctx: FloorAlertContext): string {
    const pct = ctx.occupancyPct ?? Math.round((ctx.booked / ctx.capacity) * 100);
    switch (ctx.type) {
      case FLOOR_ALERT_TYPES.FULL_100:
        return `Class Full: ${ctx.className} is at 100% (${ctx.booked}/${ctx.capacity} spots).`;
      case FLOOR_ALERT_TYPES.SURGE_90:
        return `Capacity Surge: ${ctx.className} is ${pct}% full (${ctx.booked}/${ctx.capacity} spots).`;
      case FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H:
        return `Low Attendance: ${ctx.className} has ${ctx.booked} booking(s) within 4 hours of start.`;
    }
  }

  /**
   * Combine `StudioClass.date` and `StudioClass.startTime` ("HH:mm" / "HH:mm:ss")
   * in studio local time (Asia/Kolkata, UTC+05:30).
   */
  private resolveClassStartDateTime(
    classDate: Date,
    startTime: string,
  ):
    | { ok: true; startTime: Date }
    | { ok: false; reason: InvalidScheduleReason } {
    const validDate =
      classDate instanceof Date ? classDate : new Date(classDate);
    if (Number.isNaN(validDate.getTime())) {
      return { ok: false, reason: 'INVALID_CLASS_DATE' };
    }

    const match =
      typeof startTime === 'string'
        ? startTime.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
        : null;
    if (!match) {
      return { ok: false, reason: 'INVALID_START_TIME' };
    }

    const hoursNum = Number.parseInt(match[1], 10);
    const minutesNum = Number.parseInt(match[2], 10);
    const secondsNum = match[3] ? Number.parseInt(match[3], 10) : 0;

    if (
      hoursNum < 0 ||
      hoursNum > 23 ||
      minutesNum < 0 ||
      minutesNum > 59 ||
      secondsNum < 0 ||
      secondsNum > 59
    ) {
      return { ok: false, reason: 'INVALID_START_TIME' };
    }

    const datePart = this.formatDateInTimezone(validDate, DEFAULT_TIMEZONE);
    const hours = String(hoursNum).padStart(2, '0');
    const minutes = String(minutesNum).padStart(2, '0');
    const seconds = String(secondsNum).padStart(2, '0');
    const parsed = new Date(`${datePart}T${hours}:${minutes}:${seconds}+05:30`);

    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, reason: 'INVALID_START_TIME' };
    }

    return { ok: true, startTime: parsed };
  }

  private formatDateInTimezone(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
