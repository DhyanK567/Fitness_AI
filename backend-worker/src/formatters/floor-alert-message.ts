import type { FloorAlertContext, FloorAlertType } from '../types/floor-alert.types';

/**
 * Floor Alert Message Templates (Task F8 / F10 / F11 / F13)
 *
 * Single constants section containing the canonical alert message patterns.
 * Reference: B2B Cycle 2 Work Distribution Guide (Section 7, Page 7).
 */
export const FLOOR_ALERT_TEMPLATES = {
  SURGE_90: (
    className: string,
    time: string,
    pct: number,
    booked: number,
    capacity: number,
  ) =>
    `Capacity Surge: ${className} at ${time} is now ${pct}% full (${booked}/${capacity} spots).\nPrepare additional equipment.`,

  FULL_100: (
    className: string,
    time: string,
    booked: number,
    capacity: number,
  ) =>
    `Class Full: ${className} at ${time} is now 100% full (${booked}/${capacity}).\nConsider opening a waitlist.`,

  LOW_ATTENDANCE: (
    className: string,
    time: string,
    booked: number,
  ) =>
    `Low Attendance: ${className} at ${time} has only ${booked} booking(s) and starts in 4 hours.\nLaunch an instant waitlist push or confirm trainer availability.`,

  LOW_ATTENDANCE_4H: (
    className: string,
    time: string,
    booked: number,
  ) =>
    `Low Attendance: ${className} at ${time} has only ${booked} booking(s) and starts in 4 hours.\nLaunch an instant waitlist push or confirm trainer availability.`,
} as const;

/**
 * Raw string templates for documentation, test asserts, or external pattern matchers.
 */
export const FLOOR_ALERT_TEMPLATE_STRINGS = {
  SURGE_90:
    'Capacity Surge: {class} at {time} is now {pct}% full ({booked}/{capacity} spots).\nPrepare additional equipment.',
  FULL_100:
    'Class Full: {class} at {time} is now 100% full ({booked}/{capacity}).\nConsider opening a waitlist.',
  LOW_ATTENDANCE:
    'Low Attendance: {class} at {time} has only {booked} booking(s) and starts in 4 hours.\nLaunch an instant waitlist push or confirm trainer availability.',
} as const;

/**
 * Formats an IST Date or time string to 12-hour AM/PM format (e.g. "06:00 PM").
 */
export function formatAlertTime(dateOrTime: Date | string): string {
  if (dateOrTime instanceof Date) {
    if (isNaN(dateOrTime.getTime())) {
      return '00:00 AM';
    }
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return formatter.format(dateOrTime);
  }

  if (typeof dateOrTime === 'string') {
    const trimmed = dateOrTime.trim();
    if (/^\d{1,2}:\d{2}\s*(?:AM|PM)$/i.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    // Match HH:MM or HH:MM:SS (24-hour)
    const match24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
    if (match24) {
      let hours = parseInt(match24[1], 10);
      const minutes = match24[2];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      if (hours === 0) hours = 12;
      const formattedHours = hours.toString().padStart(2, '0');
      return `${formattedHours}:${minutes} ${ampm}`;
    }
    // If it's an ISO date string
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return formatAlertTime(parsed);
    }
  }

  return '00:00 AM';
}

/**
 * Builds the canonical notification message text for studio floor capacity alerts.
 *
 * @param ctx - Floor alert context with class, time, bookings, and threshold details
 * @returns Ready-to-send alert string with exact formatting
 */
export function buildFloorAlertMessage(ctx: FloorAlertContext): string {
  if (!ctx) {
    throw new Error('FloorAlertContext is required');
  }

  const className = ctx.className || 'Class';
  const time = formatAlertTime(ctx.startTime);
  const booked = typeof ctx.booked === 'number' ? ctx.booked : 0;
  const capacity = typeof ctx.capacity === 'number' && ctx.capacity > 0 ? ctx.capacity : 1;

  const pct =
    typeof ctx.occupancyPct === 'number'
      ? Math.round(ctx.occupancyPct)
      : Math.round((booked / capacity) * 100);

  switch (ctx.type) {
    case 'SURGE_90':
      return FLOOR_ALERT_TEMPLATES.SURGE_90(className, time, pct, booked, capacity);

    case 'FULL_100':
      return FLOOR_ALERT_TEMPLATES.FULL_100(className, time, booked, capacity);

    case 'LOW_ATTENDANCE':
    case 'LOW_ATTENDANCE_4H':
      return FLOOR_ALERT_TEMPLATES.LOW_ATTENDANCE(className, time, booked);

    default:
      throw new Error(`Unsupported floor alert type: ${(ctx as any).type}`);
  }
}
