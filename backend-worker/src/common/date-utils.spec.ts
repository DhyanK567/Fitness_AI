import {
  IST_TIMEZONE,
  IST_OFFSET_MS,
  DAY_MS,
  formatDateToIstDateString,
  getCurrentIstDateString,
  getIstStartOfDay,
  getIstNextDayStart,
  getIstDayRange,
  parseIstSessionDateTime,
  isDateInIstDay,
} from './date-utils';

describe('IST Date Utilities (Asia/Kolkata)', () => {
  describe('Constants Verification', () => {
    it('should define the correct timezone identifier', () => {
      expect(IST_TIMEZONE).toBe('Asia/Kolkata');
    });

    it('should define IST offset as exactly +05:30 in milliseconds (19,800,000 ms)', () => {
      expect(IST_OFFSET_MS).toBe((5 * 60 + 30) * 60 * 1000);
      expect(IST_OFFSET_MS).toBe(19_800_000);
    });

    it('should define DAY_MS as exactly 24 hours in milliseconds (86,400,000 ms)', () => {
      expect(DAY_MS).toBe(24 * 60 * 60 * 1000);
      expect(DAY_MS).toBe(86_400_000);
    });
  });

  describe('formatDateToIstDateString', () => {
    it('should format UTC timestamp into IST YYYY-MM-DD date string', () => {
      // 2026-11-13 10:00:00 UTC = 2026-11-13 15:30:00 IST
      const date = new Date('2026-11-13T10:00:00.000Z');
      expect(formatDateToIstDateString(date)).toBe('2026-11-13');
    });

    it('should handle UTC-to-IST date rollover across midnight (late evening UTC)', () => {
      // 2026-11-12 19:00:00 UTC + 5.5h = 2026-11-13 00:30:00 IST (rolled to next day)
      const lateEveningUtc = new Date('2026-11-12T19:00:00.000Z');
      expect(formatDateToIstDateString(lateEveningUtc)).toBe('2026-11-13');
    });

    it('should handle UTC-to-IST date before midnight (early evening UTC)', () => {
      // 2026-11-12 18:29:59.999 UTC + 5.5h = 2026-11-12 23:59:59.999 IST (still 12th)
      const preMidnightUtc = new Date('2026-11-12T18:29:59.999Z');
      expect(formatDateToIstDateString(preMidnightUtc)).toBe('2026-11-12');
    });

    it('should handle early morning UTC (still same IST day)', () => {
      // 2026-11-13 01:00:00 UTC + 5.5h = 2026-11-13 06:30:00 IST
      const earlyMorningUtc = new Date('2026-11-13T01:00:00.000Z');
      expect(formatDateToIstDateString(earlyMorningUtc)).toBe('2026-11-13');
    });

    it('should throw RangeError on invalid Date instance', () => {
      expect(() => formatDateToIstDateString(new Date('invalid-date'))).toThrow(RangeError);
      expect(() => formatDateToIstDateString(null as unknown as Date)).toThrow(RangeError);
    });
  });

  describe('getCurrentIstDateString', () => {
    it('should format specified Date when provided', () => {
      const fixedDate = new Date('2026-07-15T02:00:00.000Z'); // 07:30 IST
      expect(getCurrentIstDateString(fixedDate)).toBe('2026-07-15');
    });

    it('should return valid YYYY-MM-DD pattern for current system time', () => {
      const result = getCurrentIstDateString();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getIstStartOfDay', () => {
    it('should calculate exact UTC start of day for a YYYY-MM-DD string', () => {
      // 2026-11-13 00:00:00.000 IST = 2026-11-12 18:30:00.000 UTC
      const start = getIstStartOfDay('2026-11-13');
      expect(start.toISOString()).toBe('2026-11-12T18:30:00.000Z');
    });

    it('should calculate exact UTC start of day from a Date object', () => {
      // Any instant within the 2026-11-13 IST day should yield 2026-11-12T18:30:00.000Z
      const midDay = new Date('2026-11-13T06:30:00.000Z'); // 12:00 IST
      const start = getIstStartOfDay(midDay);
      expect(start.toISOString()).toBe('2026-11-12T18:30:00.000Z');
    });

    it('should calculate start of day correctly when Date crosses UTC midnight', () => {
      // 2026-11-12 20:00:00 UTC = 2026-11-13 01:30:00 IST -> start of day is 2026-11-12T18:30:00.000Z
      const lateUtc = new Date('2026-11-12T20:00:00.000Z');
      const start = getIstStartOfDay(lateUtc);
      expect(start.toISOString()).toBe('2026-11-12T18:30:00.000Z');
    });

    it('should throw RangeError for malformed date string', () => {
      expect(() => getIstStartOfDay('not-a-date')).toThrow(RangeError);
    });
  });

  describe('getIstNextDayStart', () => {
    it('should calculate the start boundary of following IST calendar day (+24 hours)', () => {
      // 2026-11-13 start = 2026-11-12T18:30:00.000Z -> next day start = 2026-11-13T18:30:00.000Z
      const nextDayStart = getIstNextDayStart('2026-11-13');
      expect(nextDayStart.toISOString()).toBe('2026-11-13T18:30:00.000Z');
      expect(nextDayStart.getTime() - getIstStartOfDay('2026-11-13').getTime()).toBe(DAY_MS);
    });

    it('should calculate next day start correctly across month boundaries (Feb to Mar)', () => {
      // Non-leap year 2025: Feb 28 -> Mar 1
      const startFeb28 = getIstStartOfDay('2025-02-28');
      const nextDay = getIstNextDayStart('2025-02-28');
      expect(startFeb28.toISOString()).toBe('2025-02-27T18:30:00.000Z');
      expect(nextDay.toISOString()).toBe('2025-02-28T18:30:00.000Z'); // 2025-03-01 00:00:00 IST
      expect(formatDateToIstDateString(nextDay)).toBe('2025-03-01');
    });

    it('should handle leap year leap day (Feb 29 -> Mar 01)', () => {
      // Leap year 2024: Feb 29 -> Mar 1
      const startFeb29 = getIstStartOfDay('2024-02-29');
      const nextDay = getIstNextDayStart('2024-02-29');
      expect(startFeb29.toISOString()).toBe('2024-02-28T18:30:00.000Z');
      expect(nextDay.toISOString()).toBe('2024-02-29T18:30:00.000Z'); // 2024-03-01 00:00:00 IST
      expect(formatDateToIstDateString(nextDay)).toBe('2024-03-01');
    });

    it('should calculate next day start correctly across year boundary (Dec 31 to Jan 01)', () => {
      // 2026-12-31 -> 2027-01-01
      const startDec31 = getIstStartOfDay('2026-12-31');
      const nextDay = getIstNextDayStart('2026-12-31');
      expect(startDec31.toISOString()).toBe('2026-12-30T18:30:00.000Z');
      expect(nextDay.toISOString()).toBe('2026-12-31T18:30:00.000Z'); // 2027-01-01 00:00:00 IST
      expect(formatDateToIstDateString(nextDay)).toBe('2027-01-01');
    });
  });

  describe('getIstDayRange (Half-open [start, end) interval)', () => {
    it('should return range with start inclusive and end exclusive representing full 24h', () => {
      const range = getIstDayRange('2026-11-13');
      expect(range.dateString).toBe('2026-11-13');
      expect(range.start.toISOString()).toBe('2026-11-12T18:30:00.000Z');
      expect(range.end.toISOString()).toBe('2026-11-13T18:30:00.000Z');
      expect(range.end.getTime() - range.start.getTime()).toBe(DAY_MS);
    });

    it('should default to current IST day when no argument is supplied', () => {
      const range = getIstDayRange();
      expect(range.dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(range.end.getTime() - range.start.getTime()).toBe(DAY_MS);
    });

    it('should verify half-open interval boundaries correctly', () => {
      const range = getIstDayRange('2026-11-13');

      // Exact start boundary (00:00:00.000 IST) MUST be included (>= start)
      const exactStart = new Date('2026-11-12T18:30:00.000Z');
      expect(exactStart.getTime()).toBeGreaterThanOrEqual(range.start.getTime());
      expect(exactStart.getTime()).toBeLessThan(range.end.getTime());

      // 1 millisecond before start MUST NOT be included
      const oneMsBefore = new Date(range.start.getTime() - 1);
      expect(oneMsBefore.getTime() >= range.start.getTime()).toBe(false);

      // Last millisecond of the day (23:59:59.999 IST) MUST be included
      const lastMsOfDay = new Date(range.end.getTime() - 1);
      expect(lastMsOfDay.getTime()).toBeGreaterThanOrEqual(range.start.getTime());
      expect(lastMsOfDay.getTime()).toBeLessThan(range.end.getTime());

      // Exact end boundary (next day 00:00:00.000 IST) MUST be excluded (< end)
      const exactEnd = new Date('2026-11-13T18:30:00.000Z');
      expect(exactEnd.getTime() < range.end.getTime()).toBe(false);
    });
  });

  describe('parseIstSessionDateTime', () => {
    it('should parse 06:30 morning roster time correctly on target IST date', () => {
      // 2026-11-13 06:30 IST = 2026-11-13 01:00:00.000 UTC
      const sessionDate = parseIstSessionDateTime('2026-11-13', '06:30');
      expect(sessionDate.toISOString()).toBe('2026-11-13T01:00:00.000Z');
    });

    it('should parse 07:00 class time correctly on target IST date', () => {
      // 2026-11-13 07:00 IST = 2026-11-13 01:30:00.000 UTC
      const sessionDate = parseIstSessionDateTime('2026-11-13', '07:00');
      expect(sessionDate.toISOString()).toBe('2026-11-13T01:30:00.000Z');
    });

    it('should parse single-digit hours (e.g. 7:00) and HH:MM:SS format', () => {
      const withSecs = parseIstSessionDateTime('2026-11-13', '07:00:00');
      expect(withSecs.toISOString()).toBe('2026-11-13T01:30:00.000Z');

      const singleDigit = parseIstSessionDateTime('2026-11-13', '7:00');
      expect(singleDigit.toISOString()).toBe('2026-11-13T01:30:00.000Z');
    });

    it('should parse evening class at 20:30 IST', () => {
      // 2026-11-13 20:30 IST = 2026-11-13 15:00:00.000 UTC
      const eveningClass = parseIstSessionDateTime('2026-11-13', '20:30');
      expect(eveningClass.toISOString()).toBe('2026-11-13T15:00:00.000Z');
    });

    it('should throw error for invalid time string', () => {
      expect(() => parseIstSessionDateTime('2026-11-13', 'invalid')).toThrow('Invalid time format');
      expect(() => parseIstSessionDateTime('2026-11-13', '25:00')).toThrow(RangeError);
      expect(() => parseIstSessionDateTime('2026-11-13', '10:65')).toThrow(RangeError);
      expect(() => parseIstSessionDateTime('2026-11-13', '')).toThrow(TypeError);
    });
  });

  describe('isDateInIstDay', () => {
    const targetDate = '2026-11-13';

    it('should return true for timestamps within the IST day', () => {
      const morningClass = new Date('2026-11-13T01:30:00.000Z'); // 07:00 IST
      const eveningClass = new Date('2026-11-13T15:00:00.000Z'); // 20:30 IST
      expect(isDateInIstDay(morningClass, targetDate)).toBe(true);
      expect(isDateInIstDay(eveningClass, targetDate)).toBe(true);
    });

    it('should return true at exact start of IST day (00:00:00.000 IST)', () => {
      const startOfDay = new Date('2026-11-12T18:30:00.000Z');
      expect(isDateInIstDay(startOfDay, targetDate)).toBe(true);
    });

    it('should return true at 23:59:59.999 IST', () => {
      const endOfIstDay = new Date('2026-11-13T18:29:59.999Z');
      expect(isDateInIstDay(endOfIstDay, targetDate)).toBe(true);
    });

    it('should return false at exact start of next day (2026-11-13T18:30:00.000Z)', () => {
      const nextDayStart = new Date('2026-11-13T18:30:00.000Z');
      expect(isDateInIstDay(nextDayStart, targetDate)).toBe(false);
    });

    it('should return false for timestamps before start of day', () => {
      const previousDay = new Date('2026-11-12T18:29:59.999Z');
      expect(isDateInIstDay(previousDay, targetDate)).toBe(false);
    });

    it('should return false for invalid dates', () => {
      expect(isDateInIstDay(new Date('invalid'), targetDate)).toBe(false);
    });
  });
});
