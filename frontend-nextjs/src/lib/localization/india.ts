export const INDIA_TIME_ZONE = 'Asia/Kolkata';

const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const IST_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: INDIA_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

const IST_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: INDIA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

export const INDIAN_MOBILE_PATTERN = /^(?:\+91[-\s]?)?[6-9]\d{9}$/;

export function formatInr(value: number | string | null | undefined): string {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  return INR_FORMATTER.format(Number.isFinite(amount) ? amount : 0);
}

export const formatIndianCurrency = formatInr;

function parseDate(value: Date | string | number): Date | null {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDayPeriod(value: string): string {
  return value.replace(/\b(am|pm)\b/gi, (period) => period.toUpperCase());
}

export function formatIstDateTime(
  value: Date | string | number | null | undefined,
  fallback = 'Date unavailable',
): string {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = parseDate(value);
  return parsed ? normalizeDayPeriod(IST_DATE_TIME_FORMATTER.format(parsed)) : fallback;
}

export function formatIstTime(
  value: Date | string | number | null | undefined,
  fallback = 'Time unavailable',
): string {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = parseDate(value);
  return parsed ? normalizeDayPeriod(IST_TIME_FORMATTER.format(parsed)) : fallback;
}

export function normalizeIndianMobile(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (compact.startsWith('0091')) return `+91${compact.slice(4)}`;
  if (compact.startsWith('91') && compact.length === 12) return `+${compact}`;
  return compact;
}

export function isValidIndianMobile(value: string): boolean {
  return INDIAN_MOBILE_PATTERN.test(normalizeIndianMobile(value));
}

export function indianMobileNationalNumber(value: string): string {
  const normalized = normalizeIndianMobile(value);
  return normalized.startsWith('+91') ? normalized.slice(3) : normalized;
}

export function formatIndianMobile(value: string, fallback = value): string {
  const normalized = normalizeIndianMobile(value);
  const nationalNumber = indianMobileNationalNumber(normalized);
  if (!/^[6-9]\d{9}$/.test(nationalNumber)) return fallback;
  return `+91 ${nationalNumber.slice(0, 5)} ${nationalNumber.slice(5)}`;
}
