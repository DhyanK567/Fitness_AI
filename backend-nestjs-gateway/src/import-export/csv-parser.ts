/**
 * CSV Parser and Formula-Injection Sanitizer for Studio OS Bulk Data.
 * Handles quoted fields, embedded commas, CRLF/LF line endings, and
 * OWASP-compliant spreadsheet formula injection prevention on export.
 */

// Regex identifying formula trigger characters, including those preceded by leading whitespace or control characters
const FORMULA_INJECTION_PATTERN = /^[\s\u0000-\u001f]*[=+\-@\t\r%]/;

/**
 * Sanitizes a cell value to prevent CSV / Spreadsheet Formula Injection (CSV Injection).
 * If a text field begins with formula trigger characters (=, +, -, @, \t, \r, %),
 * it is prefixed with a single quote (') to force spreadsheet applications (Excel, Calc, Google Sheets)
 * to interpret the cell as a text literal rather than an executable formula or DDE command.
 *
 * Genuine numeric types are not sanitized, preserving negative numbers and numeric calculations.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Preserve native numeric types without formula escaping
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  if (typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }

  const str = String(value);

  // If text string starts with formula trigger characters (even with leading whitespace/control chars),
  // prefix with a single quote to force text literal evaluation in spreadsheet software.
  if (FORMULA_INJECTION_PATTERN.test(str)) {
    return `'${str}`;
  }

  return str;
}

/**
 * Encodes an array of cell values into a standard RFC 4180 compliant CSV line,
 * applying formula-injection sanitization to each cell.
 */
export function formatCsvRow(cells: unknown[]): string {
  return cells
    .map((cell) => {
      const sanitized = sanitizeCsvCell(cell);
      // Quote if containing commas, quotes, or newlines
      if (sanitized.includes('"') || sanitized.includes(',') || sanitized.includes('\n') || sanitized.includes('\r')) {
        return `"${sanitized.replace(/"/g, '""')}"`;
      }
      return sanitized;
    })
    .join(',');
}

/**
 * Formats an array of records into a sanitized, safe RFC 4180 CSV string with headers.
 */
export function formatStudioCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const headerLine = formatCsvRow(headers);
  const dataLines = rows.map((row) => {
    const values = headers.map((header) => row[header]);
    return formatCsvRow(values);
  });
  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Minimal CSV parser matching the frontend's parseStudioCsv contract.
 * Handles quoted fields, embedded commas, and CRLF/LF line endings.
 */
export function parseStudioCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

/** Converts a CSV document into object rows using its first row as headers. */
export function parseStudioCsvRecords(source: string): Array<Record<string, string>> {
  const matrix = parseStudioCsv(source.replace(/^\uFEFF/, ''));
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error('CSV headers cannot be empty.');
  const aliases: Record<string, string> = {
    fullname: 'name',
    full_name: 'name',
    followupdate: 'followUpDate',
    follow_up_date: 'followUpDate',
    starttime: 'startTime',
    start_time: 'startTime',
    endtime: 'endTime',
    end_time: 'endTime',
    priceinr: 'priceINR',
    price_inr: 'priceINR',
    plantype: 'planType',
    plan_type: 'planType',
    sessionlimit: 'sessionLimit',
    session_limit: 'sessionLimit',
    memberid: 'memberId',
    member_id: 'memberId',
    classid: 'classId',
    class_id: 'classId',
    bookingid: 'bookingId',
    booking_id: 'bookingId',
    checkedinat: 'checkedInAt',
    checked_in_at: 'checkedInAt',
    refundedamount: 'refundedAmount',
    refunded_amount: 'refundedAmount',
    startat: 'startAt',
    start_at: 'startAt',
    endat: 'endAt',
    end_at: 'endAt',
  };
  const canonicalHeaders = headers.map((header) => aliases[header.toLowerCase()] ?? header.toLowerCase());
  const normalized = canonicalHeaders.map((header) => header.toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw new Error('CSV headers must be unique.');

  return matrix.slice(1).map((cells) => Object.fromEntries(
    canonicalHeaders.map((header, index) => [header, (cells[index] ?? '').trim()]),
  ));
}

export const DATASET_CSV_HEADERS = {
  members: ['id', 'name', 'email', 'phone', 'plan', 'status', 'joined', 'expiry', 'coach'],
  leads: ['name', 'email', 'phone', 'source', 'stage', 'followUpDate', 'assigned', 'plan', 'notes'],
  classes: ['id', 'name', 'category', 'date', 'startTime', 'endTime', 'trainer', 'room', 'capacity', 'status'],
  memberships: ['name', 'planType', 'priceINR', 'sessionLimit', 'benefits', 'active'],
  bookings: ['id', 'memberId', 'classId', 'status', 'bookedAt'],
  attendance: ['bookingId', 'memberId', 'className', 'date', 'status', 'checkedInAt'],
  payments: ['ref', 'memberId', 'type', 'date', 'amount', 'currency', 'method', 'status', 'refundedAmount', 'notes'],
  events: ['title', 'category', 'description', 'startAt', 'endAt', 'venue', 'organizer', 'capacity', 'cancelled', 'published'],
} as const;

const EXPORT_FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'fullName', 'full_name'],
  joined: ['joined', 'joinDate', 'join_date'],
  planType: ['planType', 'plan_type'],
  priceINR: ['priceINR', 'price_inr', 'price'],
  sessionLimit: ['sessionLimit', 'session_limit'],
  memberId: ['memberId', 'member_id'],
  classId: ['classId', 'class_id'],
  bookingId: ['bookingId', 'booking_id'],
  checkedInAt: ['checkedInAt', 'checked_in_at'],
  refundedAmount: ['refundedAmount', 'refunded_amount'],
  startAt: ['startAt', 'start_at'],
  endAt: ['endAt', 'end_at'],
  startTime: ['startTime', 'start_time'],
  endTime: ['endTime', 'end_time'],
  followUpDate: ['followUpDate', 'follow_up_date'],
};

function exportValue(record: Record<string, unknown>, header: string): unknown {
  for (const key of EXPORT_FIELD_ALIASES[header] ?? [header]) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return '';
}

export function formatDatasetCsv(
  dataset: keyof typeof DATASET_CSV_HEADERS,
  rows: Array<Record<string, unknown>>,
): string {
  const headers = [...DATASET_CSV_HEADERS[dataset]];
  return formatStudioCsv(
    headers,
    rows.map((row) => Object.fromEntries(headers.map((header) => [header, exportValue(row, header)]))),
  );
}
