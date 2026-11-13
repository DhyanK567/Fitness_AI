import type { RosterSession, TrainerRoster } from '../types/roster.types';
import { HEALTH_FLAG_COACHING_NOTES } from '../services/health-flags.mapper';

/**
 * Returns an appropriate activity emoji based on class category or name.
 */
export function getSessionCategoryIcon(className: string): string {
  const normalized = (className || '').toLowerCase();

  if (/yoga|mobility|pilates|core|stretch|flexibility/i.test(normalized)) {
    return '🧘';
  }
  if (/box|kickbox|combat|mma|hiit|bootcamp/i.test(normalized)) {
    return '🥊';
  }
  if (/cycle|spin|bike/i.test(normalized)) {
    return '🚴';
  }
  if (/run|treadmill|cardio/i.test(normalized)) {
    return '🏃';
  }
  return '🏋️';
}

/**
 * Formats an IST Date or time string to standard 12-hour AM/PM format (e.g., "07:00 AM").
 */
export function formatSessionTime(dateOrTime: Date | string): string {
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
  }

  return '00:00 AM';
}

/**
 * Formats an IST calendar date string (YYYY-MM-DD) into display format: "Wednesday, Nov 12".
 */
export function formatRosterDate(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') {
    return '';
  }

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return dateStr;
  }

  // Construct noon UTC Date to safely format in Asia/Kolkata without DST shift
  const dateObj = new Date(Date.UTC(year, month - 1, day, 6, 30, 0));

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return formatter.format(dateObj);
}

/**
 * Formats a single class session into its WhatsApp card block.
 */
export function formatSessionBlock(session: RosterSession, index: number): string {
  const icon = getSessionCategoryIcon(session.className);
  const sessionNum = index + 1;
  const timeStr = formatSessionTime(session.startTime);
  const roomName = session.roomName || 'Main Studio';

  const isSoldOut = session.soldOut || session.confirmed >= session.capacity;
  const attendanceSuffix = isSoldOut ? '(SOLD OUT)' : 'Confirmed';

  const lines: string[] = [
    `${icon} Session ${sessionNum}: ${timeStr} - ${session.className} (${roomName})`,
    `👥 Attendance: ${session.confirmed}/${session.capacity} ${attendanceSuffix}`,
  ];

  if (session.notes && session.notes.length > 0) {
    lines.push('⚠️ Important Client Notes:');
    for (const note of session.notes) {
      const coachingText =
        note.text ||
        HEALTH_FLAG_COACHING_NOTES[note.kind as keyof typeof HEALTH_FLAG_COACHING_NOTES] ||
        note.kind;
      lines.push(`• ${note.memberName} (${coachingText})`);
    }
  }

  return lines.join('\n');
}

/**
 * Formats a complete TrainerRoster into a personalized WhatsApp briefing.
 *
 * Requirements:
 * - Greeting with coach name and IST date
 * - Chronological session blocks with attendance & SOLD OUT badges
 * - Important Client Notes section when medical/onboarding flags exist
 * - High-energy closing line
 * - Returns empty string for empty rosters (no sessions scheduled)
 *
 * Reference: Cycle 2 B2B Execution Guide (Section 2, Page 2).
 *
 * @param roster - Assembled TrainerRoster contract
 * @returns Plain text formatted briefing ready for WhatsApp dispatch
 */
export function formatTrainerBriefing(roster: TrainerRoster): string {
  if (!roster || !roster.sessions || roster.sessions.length === 0) {
    return '';
  }

  const rawTrainerName = (roster.trainerName || 'Trainer').trim();
  const coachGreeting = /^coach\b/i.test(rawTrainerName)
    ? rawTrainerName
    : `Coach ${rawTrainerName}`;

  const formattedDate = formatRosterDate(roster.date);
  const header = `🌅 Good morning ${coachGreeting}! Here is your schedule for today (${formattedDate}):`;

  const sessionBlocks = roster.sessions.map((session, idx) =>
    formatSessionBlock(session, idx),
  );

  const closing = 'Have a high-energy day on the floor!';

  return [header, ...sessionBlocks, closing].join('\n\n');
}
