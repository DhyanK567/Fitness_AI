import { describe, it, expect } from '@jest/globals';
import {
  sanitizeCsvCell,
  formatCsvRow,
  formatStudioCsv,
  formatDatasetCsv,
  parseStudioCsv,
  parseStudioCsvRecords,
} from '../csv-parser';

describe('CSV Formula-Injection Protection & Sanitization', () => {
  describe('1. Formula Marker Neutralization', () => {
    it('neutralizes values beginning with = (equals formula)', () => {
      expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeCsvCell('=cmd|\' /C calc\'!\'A1\'')).toBe("'=cmd|' /C calc'!'A1'");
    });

    it('neutralizes values beginning with + (plus expression)', () => {
      expect(sanitizeCsvCell('+1+2')).toBe("'+1+2");
      expect(sanitizeCsvCell('+cmd|...')).toBe("'+cmd|...");
    });

    it('neutralizes values beginning with - (minus expression)', () => {
      expect(sanitizeCsvCell('-2+3*4')).toBe("'-2+3*4");
      expect(sanitizeCsvCell('-12345')).toBe("'-12345");
    });

    it('neutralizes values beginning with @ (at formula indicator)', () => {
      expect(sanitizeCsvCell('@SUM(1,2)')).toBe("'@SUM(1,2)");
    });

    it('neutralizes values beginning with % (percent formula)', () => {
      expect(sanitizeCsvCell('%00')).toBe("'%00");
    });
  });

  describe('2. Leading Whitespace and Control Character Evasion', () => {
    it('neutralizes formula markers preceded by leading spaces', () => {
      expect(sanitizeCsvCell('   =1+1')).toBe("'   =1+1");
      expect(sanitizeCsvCell('  +2+2')).toBe("'  +2+2");
      expect(sanitizeCsvCell(' -3')).toBe("' -3");
      expect(sanitizeCsvCell('  @SUM()')).toBe("'  @SUM()");
    });

    it('neutralizes formula markers preceded by tab characters (\\t)', () => {
      expect(sanitizeCsvCell('\t=cmd')).toBe("'\t=cmd");
      expect(sanitizeCsvCell('  \t  =1+1')).toBe("'  \t  =1+1");
    });

    it('neutralizes formula markers preceded by carriage return (\\r) or newline (\\n)', () => {
      expect(sanitizeCsvCell('\r=calc')).toBe("'\r=calc");
      expect(sanitizeCsvCell('\n=calc')).toBe("'\n=calc");
    });

    it('neutralizes formula markers preceded by null or ASCII control bytes', () => {
      expect(sanitizeCsvCell('\u0000=calc')).toBe("'\u0000=calc");
      expect(sanitizeCsvCell('\u001f=calc')).toBe("'\u001f=calc");
    });
  });

  describe('3. Normal Values Preservation', () => {
    it('leaves standard text values untouched without single quote prefix', () => {
      expect(sanitizeCsvCell('John Doe')).toBe('John Doe');
      expect(sanitizeCsvCell('Active')).toBe('Active');
      expect(sanitizeCsvCell('Premium')).toBe('Premium');
      expect(sanitizeCsvCell('Pilates Reformer - Level 1')).toBe('Pilates Reformer - Level 1');
      expect(sanitizeCsvCell('member@wellness.example')).toBe('member@wellness.example');
    });

    it('preserves native numeric primitives without formula escaping', () => {
      expect(sanitizeCsvCell(100)).toBe('100');
      expect(sanitizeCsvCell(0)).toBe('0');
      expect(sanitizeCsvCell(-500)).toBe('-500'); // genuine negative numbers
      expect(sanitizeCsvCell(49.99)).toBe('49.99');
    });

    it('handles booleans, dates, null and undefined cleanly', () => {
      expect(sanitizeCsvCell(true)).toBe('true');
      expect(sanitizeCsvCell(false)).toBe('false');
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');

      const date = new Date('2026-04-12T10:00:00.000Z');
      expect(sanitizeCsvCell(date)).toBe('2026-04-12T10:00:00.000Z');
    });
  });

  describe('4. Quoting, Escaping and RFC 4180 CSV Formatting', () => {
    it('quotes cells containing commas, quotes, and newlines', () => {
      const row = formatCsvRow(['John Doe', 'Bangalore, India', 'Note with "quotes"']);
      expect(row).toBe('John Doe,"Bangalore, India","Note with ""quotes"""');
    });

    it('quotes formula-sanitized cells that also have embedded commas', () => {
      const row = formatCsvRow(['=SUM(A1, B1)']);
      expect(row).toBe('"\'=SUM(A1, B1)"');
    });

    it('formats a complete CSV dataset with sanitized formulas in data rows', () => {
      const headers = ['name', 'email', 'notes'];
      const data = [
        { name: 'Sarah Connor', email: 'sarah@example.com', notes: 'VIP Member' },
        { name: '=MALICIOUS', email: 'evil@example.com', notes: '  +cmd|calculator' },
      ];

      const csv = formatStudioCsv(headers, data);
      const lines = csv.split('\r\n');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('name,email,notes');
      expect(lines[1]).toBe('Sarah Connor,sarah@example.com,VIP Member');
      expect(lines[2]).toBe("'=MALICIOUS,evil@example.com,'  +cmd|calculator");
    });
  });

  describe('5. Round-trip Parsing Contract', () => {
    it('parses formatted CSV including quotes, escaped quotes, and newlines', () => {
      const csv = 'name,email,notes\r\n"Doe, John",john@example.com,"Line 1\nLine 2"';
      const parsed = parseStudioCsv(csv);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual(['name', 'email', 'notes']);
      expect(parsed[1]).toEqual(['Doe, John', 'john@example.com', 'Line 1\nLine 2']);
    });

    it('converts a BOM-prefixed CSV document into header-keyed import records', () => {
      const records = parseStudioCsvRecords('\uFEFFname,email,notes\r\n"Doe, Jane",jane@example.com,"A, B"');
      expect(records).toEqual([{ name: 'Doe, Jane', email: 'jane@example.com', notes: 'A, B' }]);
    });

    it('canonicalizes case and snake-case dataset headers before DTO validation', () => {
      const records = parseStudioCsvRecords('Member_ID,Class_ID,Start_Time,Price_INR\r\nmember-1,class-1,07:00,1200');
      expect(records).toEqual([{ memberId: 'member-1', classId: 'class-1', startTime: '07:00', priceINR: '1200' }]);
    });

    it('rejects duplicate headers instead of silently overwriting values', () => {
      expect(() => parseStudioCsvRecords('name,name\r\nA,B')).toThrow('CSV headers must be unique');
    });

    it('exports the exact dataset schema with aliases and RFC-4180 escaping', () => {
      const csv = formatDatasetCsv('members', [{
        fullName: 'Doe, Jane', email: 'jane@example.com', phone: '123', plan: 'Premium',
        status: 'Active', joined: '2026-01-01', expiry: null, coach: '=HYPERLINK("bad")',
      }]);
      expect(csv.split('\r\n')[0]).toBe('id,name,email,phone,plan,status,joined,expiry,coach');
      expect(csv).toContain('"Doe, Jane"');
      expect(csv).toContain("'=HYPERLINK");
    });
  });
});
