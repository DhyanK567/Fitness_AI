/**
 * Indian Standard Time (IST) Date Utilities
 *
 * Implements deterministic date manipulation for Asia/Kolkata timezone (UTC+05:30).
 * IST does not observe Daylight Saving Time (DST); the UTC offset is strictly +05:30.
 *
 * Designed for the Trainer Morning Roster pipeline (Member A).
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * 5 hours 30 minutes in milliseconds = 19,800,000 ms.
 */
export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Exactly 24 hours in milliseconds = 86,400,000 ms.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cached DateTimeFormat instance for extracting IST calendar parts.
 */
const istDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: IST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface IstDayRange {
  start: Date;
  end: Date;
  dateString: string;
}

/**
 * Formats a Date object into an IST calendar date string (YYYY-MM-DD).
 *
 * Independent of the runtime server's local timezone.
 *
 * @param date - Date to format
 * @returns YYYY-MM-DD string in IST
 * @throws RangeError if date is invalid
 */
export function formatDateToIstDateString(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new RangeError('Invalid date provided to formatDateToIstDateString');
  }

  const parts = istDateFormatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      partMap[part.type] = part.value;
    }
  }

  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

/**
 * Returns today's date in IST formatted as YYYY-MM-DD.
 *
 * @param now - Optional reference date (defaults to current system time)
 * @returns YYYY-MM-DD string in IST
 */
export function getCurrentIstDateString(now: Date = new Date()): string {
  return formatDateToIstDateString(now);
}

/**
 * Resolves the given date input into year, month (1-indexed), and day numbers.
 *
 * @internal
 */
function resolveIstParts(dateInput: string | Date): { year: number; month: number; day: number; dateString: string } {
  let dateString: string;

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateMatch) {
      dateString = trimmed;
    } else {
      const parsedDate = new Date(trimmed);
      if (isNaN(parsedDate.getTime())) {
        throw new RangeError(`Invalid date string provided: "${dateInput}"`);
      }
      dateString = formatDateToIstDateString(parsedDate);
    }
  } else if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) {
      throw new RangeError('Invalid Date object provided');
    }
    dateString = formatDateToIstDateString(dateInput);
  } else {
    throw new TypeError('dateInput must be a string or Date object');
  }

  const [yearStr, monthStr, dayStr] = dateString.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  return { year, month, day, dateString };
}

/**
 * Calculates the start boundary of an IST calendar day (00:00:00.000 IST).
 *
 * For example, 2026-11-13 00:00:00.000 IST corresponds in UTC to:
 * 2026-11-12T18:30:00.000Z.
 *
 * @param dateInput - YYYY-MM-DD string or Date object
 * @returns Date object representing 00:00:00.000 IST in UTC
 */
export function getIstStartOfDay(dateInput: string | Date): Date {
  const { year, month, day } = resolveIstParts(dateInput);
  const utcMidnightMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return new Date(utcMidnightMs - IST_OFFSET_MS);
}

/**
 * Calculates the start boundary of the following IST calendar day (next day 00:00:00.000 IST).
 *
 * Since IST has no DST, this is strictly startOfDay + 24 hours (86,400,000 ms).
 *
 * @param dateInput - YYYY-MM-DD string or Date object
 * @returns Date object representing the next day's 00:00:00.000 IST in UTC
 */
export function getIstNextDayStart(dateInput: string | Date): Date {
  const startOfDay = getIstStartOfDay(dateInput);
  return new Date(startOfDay.getTime() + DAY_MS);
}

/**
 * Generates the half-open query range [start, end) representing an entire IST calendar day.
 *
 * - `start` is inclusive (00:00:00.000 IST).
 * - `end` is exclusive (next day 00:00:00.000 IST).
 * - `dateString` is the normalized `YYYY-MM-DD` string in IST.
 *
 * Queries should check: `record.classDate >= start && record.classDate < end`.
 *
 * @param dateInput - Optional YYYY-MM-DD string or Date (defaults to current IST day)
 * @returns IstDayRange containing start, end, and dateString
 */
export function getIstDayRange(dateInput?: string | Date): IstDayRange {
  const input = dateInput ?? new Date();
  const { dateString } = resolveIstParts(input);
  const start = getIstStartOfDay(dateString);
  const end = new Date(start.getTime() + DAY_MS);

  return {
    start,
    end,
    dateString,
  };
}

/**
 * Parses an IST class session time (e.g., '07:00' or '06:30:00') on a specified IST day
 * into a single UTC Date object, matching the RosterSession.startTime contract.
 *
 * @param dateInput - YYYY-MM-DD string or Date object representing the session date
 * @param timeString - Time string in HH:MM or HH:MM:SS format
 * @returns Date object representing the exact session start instant
 * @throws Error if timeString is malformed or out of bounds
 */
export function parseIstSessionDateTime(dateInput: string | Date, timeString: string): Date {
  if (!timeString || typeof timeString !== 'string') {
    throw new TypeError('timeString must be a non-empty string in HH:MM or HH:MM:SS format');
  }

  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeString.trim());
  if (!match) {
    throw new Error(`Invalid time format: "${timeString}". Expected HH:MM or HH:MM:SS`);
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;

  if (hours < 0 || hours > 23) {
    throw new RangeError(`Hours out of range (0-23): ${hours}`);
  }
  if (minutes < 0 || minutes > 59) {
    throw new RangeError(`Minutes out of range (0-59): ${minutes}`);
  }
  if (seconds < 0 || seconds > 59) {
    throw new RangeError(`Seconds out of range (0-59): ${seconds}`);
  }

  const startOfDay = getIstStartOfDay(dateInput);
  const timeOffsetMs = (hours * 3600 + minutes * 60 + seconds) * 1000;

  return new Date(startOfDay.getTime() + timeOffsetMs);
}

/**
 * Checks whether a given UTC Date timestamp falls within a specific IST calendar day
 * based on the half-open interval: start <= timestamp < end.
 *
 * @param date - The Date timestamp to test
 * @param rangeOrDate - An IstDayRange object or a dateInput (string | Date)
 * @returns true if the date is within the IST calendar day
 */
export function isDateInIstDay(
  date: Date,
  rangeOrDate: IstDayRange | string | Date,
): boolean {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return false;
  }

  const range = (rangeOrDate && typeof rangeOrDate === 'object' && 'start' in rangeOrDate && 'end' in rangeOrDate)
    ? rangeOrDate
    : getIstDayRange(rangeOrDate as string | Date);

  const time = date.getTime();
  return time >= range.start.getTime() && time < range.end.getTime();
}
