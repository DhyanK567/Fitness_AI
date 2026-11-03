import { Injectable } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

export interface LowAttendanceRecord {
  class_session?: string;
  session_id?: string;
  name?: string;
  class_type?: string;
  class_name?: string;
  session_name?: string;
  capacity?: number;
  offered_capacity?: number;
  attendance_count?: number;
  confirmed_count?: number;
  attendance_rate?: number;
  occupancy_percent?: number;
  status?: string;
}

export interface FormattedLowAttendanceClass {
  classSessionId: string;
  classType: string;
  className: string;
  capacity: number;
  attendanceCount: number;
  attendanceRate: number;
}

function getFormattedDateInTimezone(tz: string, date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function subtractDaysFromDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day - days));
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class LowAttendanceClassesTool extends BaseTool {
  async execute(context: ToolContext, args: { thresholdPercent?: number; periodDays?: number; now?: Date | string; timezone?: string } = {}): Promise<ToolResult> {
    const rawThreshold = args.thresholdPercent !== undefined ? Number(args.thresholdPercent) : 50;
    const thresholdPercent = Number.isFinite(rawThreshold) && rawThreshold >= 0 && rawThreshold <= 100 ? rawThreshold : 50;

    const rawPeriod = args.periodDays !== undefined ? Number(args.periodDays) : 30;
    const periodDays = Number.isInteger(rawPeriod) && rawPeriod >= 1 && rawPeriod <= 90 ? rawPeriod : 30;

    const timezone = args.timezone || (context as any).timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
    const clock = args.now ? (args.now instanceof Date ? args.now : new Date(args.now)) : ((context as any).now ? new Date((context as any).now) : new Date());

    const todayStr = getFormattedDateInTimezone(timezone, clock);
    const fromDateStr = subtractDaysFromDateString(todayStr, periodDays);

    // Call the authoritative ERPNext whitelisted report method: run_report(report_code='low_attendance_classes')
    let result = await this.callErp<any>(
      context,
      ERP_METHODS.REPORT_RUN,
      {
        tenant: context.tenantId,
        report_code: 'low_attendance_classes',
        from_date: fromDateStr,
        to_date: todayStr,
      },
      'GET',
    );

    // If run_report returns method unavailable (e.g. in legacy tests), fallback to legacy endpoint
    if (!result.success && (result.error?.includes('unavailable') || result.error?.includes('DoesNotExistError') || result.error?.includes('Method not found'))) {
      const legacyResult = await this.callErp<any>(context, ERP_METHODS.REPORT_LOW_ATTENDANCE, {
        threshold_percent: thresholdPercent,
        period_days: periodDays,
      });
      if (legacyResult.success) {
        result = legacyResult;
      }
    }

    if (!result.success) return result;

    const rawData = result.data?.rows ?? result.data?.classes ?? (Array.isArray(result.data) ? result.data : []);
    const records: LowAttendanceRecord[] = Array.isArray(rawData) ? rawData : [];

    const formatted: FormattedLowAttendanceClass[] = [];

    for (const c of records) {
      // Exclude cancelled classes per domain rules
      if (c.status && ['cancelled', 'Cancelled'].includes(c.status)) {
        continue;
      }

      const capacity = Number(c.capacity ?? c.offered_capacity ?? 0);
      // Zero or missing capacity cannot have a defined attendance rate; exclude from low-attendance warnings
      if (!Number.isFinite(capacity) || capacity <= 0) {
        continue;
      }

      const attendanceCount = Number(c.attendance_count ?? c.confirmed_count ?? 0);
      if (!Number.isFinite(attendanceCount) || attendanceCount < 0) {
        continue;
      }

      // Calculate or verify rate: (attendance / capacity) * 100
      let rate = typeof c.attendance_rate === 'number'
        ? c.attendance_rate
        : typeof c.occupancy_percent === 'number'
          ? c.occupancy_percent
          : Math.round((attendanceCount / capacity) * 10000) / 100;

      // Round to 2 decimal places
      rate = Math.round(rate * 100) / 100;

      // Boundary semantics: strictly below the threshold percentage (< 50%)
      // If rate == thresholdPercent, it is NOT below threshold.
      if (rate >= thresholdPercent) {
        continue;
      }

      const sessionId = c.class_session || c.session_id || c.name || 'unknown-session';
      const classType = c.class_type || 'General';
      const className = c.class_name || c.session_name || classType;

      formatted.push({
        classSessionId: sessionId,
        classType,
        className,
        capacity,
        attendanceCount,
        attendanceRate: rate,
      });
    }

    // Sort ascending by attendance rate (lowest attendance first)
    formatted.sort((a, b) => a.attendanceRate - b.attendanceRate);

    return this.success({
      count: formatted.length,
      thresholdPercent,
      periodDays,
      classes: formatted,
      summary: `${formatted.length} class(es) with attendance below ${thresholdPercent}% in the last ${periodDays} days`,
    });
  }
}
