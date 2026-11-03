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
      } else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }

  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function createStudioCsv(headers: string[], rows: unknown[][]): string {
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
}

export interface StudioWorksheetSpec {
  name: string;
  headers: string[];
  rows: unknown[][];
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip invalid XML 1.0 control chars except tab, LF, CR
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function toColumnLetter(colIndexZeroBased: number): string {
  let index = colIndexZeroBased + 1;
  let letters = '';
  while (index > 0) {
    const mod = (index - 1) % 26;
    letters = String.fromCharCode(65 + mod) + letters;
    index = Math.floor((index - 1) / 26);
  }
  return letters;
}

function sanitizeSheetName(rawName: string, fallbackIndex: number): string {
  const cleaned = rawName.replace(/[\\/?*:[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = cleaned || `Sheet${fallbackIndex}`;
  return base.slice(0, 31);
}

function buildWorksheetXml(headers: string[], rows: unknown[][]): string {
  const colCount = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  const colWidths: number[] = new Array(colCount).fill(12);

  headers.forEach((header, idx) => {
    colWidths[idx] = Math.max(colWidths[idx], Math.min(44, String(header ?? '').length + 5));
  });
  rows.forEach((row) => {
    row.forEach((cell, idx) => {
      if (idx < colCount) {
        const len = cell == null ? 0 : String(cell).length;
        colWidths[idx] = Math.max(colWidths[idx], Math.min(44, len + 4));
      }
    });
  });

  const colsXml = `<cols>${colWidths
    .map((width, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${width}" customWidth="1"/>`)
    .join('')}</cols>`;

  const allRows: Array<{ values: unknown[]; isHeader: boolean }> = [
    { values: headers, isHeader: true },
    ...rows.map((values) => ({ values, isHeader: false })),
  ];

  const rowsXml = allRows
    .map(({ values, isHeader }, rowIdx) => {
      const rowNumber = rowIdx + 1;
      const styleIndex = isHeader ? 1 : 0;
      const heightAttr = isHeader ? ' ht="24" customHeight="1"' : ' ht="20" customHeight="1"';

      const cellsXml = values
        .map((rawVal, colIdx) => {
          const cellRef = `${toColumnLetter(colIdx)}${rowNumber}`;
          if (!isHeader && typeof rawVal === 'number' && Number.isFinite(rawVal)) {
            return `<c r="${cellRef}" s="${styleIndex}" t="n"><v>${rawVal}</v></c>`;
          }
          if (!isHeader && typeof rawVal === 'boolean') {
            return `<c r="${cellRef}" s="${styleIndex}" t="b"><v>${rawVal ? 1 : 0}</v></c>`;
          }
          const text = rawVal == null ? '' : String(rawVal);
          return `<c r="${cellRef}" s="${styleIndex}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
        })
        .join('');

      return `<row r="${rowNumber}"${heightAttr}>${cellsXml}</row>`;
    })
    .join('');

  const lastCol = toColumnLetter(colCount - 1);
  const lastRow = Math.max(allRows.length, 1);

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<dimension ref="A1:${lastCol}${lastRow}"/>`,
    '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>',
    '<sheetFormatPr defaultRowHeight="20"/>',
    colsXml,
    `<sheetData>${rowsXml}</sheetData>`,
    '</worksheet>',
  ].join('');
}

function buildZipArchive(files: Array<{ path: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const encodedEntries = files.map((file) => {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc, offset: 0 };
  });

  let localSize = 0;
  let centralSize = 0;
  encodedEntries.forEach((entry) => {
    entry.offset = localSize;
    localSize += 30 + entry.nameBytes.length + entry.dataBytes.length;
    centralSize += 46 + entry.nameBytes.length;
  });

  const totalSize = localSize + centralSize + 22;
  const buffer = new ArrayBuffer(totalSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  let pos = 0;
  encodedEntries.forEach((entry) => {
    // Local file header signature PK\x03\x04
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true); // version needed
    view.setUint16(pos + 6, 0x0800, true); // UTF-8 flag
    view.setUint16(pos + 8, 0, true); // compression method: 0 (STORE)
    view.setUint16(pos + 10, 0, true); // mod time
    view.setUint16(pos + 12, 0x5421, true); // mod date
    view.setUint32(pos + 14, entry.crc, true);
    view.setUint32(pos + 18, entry.dataBytes.length, true);
    view.setUint32(pos + 22, entry.dataBytes.length, true);
    view.setUint16(pos + 26, entry.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true); // extra field length
    pos += 30;

    bytes.set(entry.nameBytes, pos);
    pos += entry.nameBytes.length;
    bytes.set(entry.dataBytes, pos);
    pos += entry.dataBytes.length;
  });

  const centralDirOffset = pos;
  encodedEntries.forEach((entry) => {
    // Central directory file header signature PK\x01\x02
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true); // version made by
    view.setUint16(pos + 6, 20, true); // version needed
    view.setUint16(pos + 8, 0x0800, true); // UTF-8 flag
    view.setUint16(pos + 10, 0, true); // compression method: 0 (STORE)
    view.setUint16(pos + 12, 0, true); // mod time
    view.setUint16(pos + 14, 0x5421, true); // mod date
    view.setUint32(pos + 16, entry.crc, true);
    view.setUint32(pos + 20, entry.dataBytes.length, true);
    view.setUint32(pos + 24, entry.dataBytes.length, true);
    view.setUint16(pos + 28, entry.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true); // extra length
    view.setUint16(pos + 32, 0, true); // comment length
    view.setUint16(pos + 34, 0, true); // disk number
    view.setUint16(pos + 36, 0, true); // internal attrs
    view.setUint32(pos + 38, 0, true); // external attrs
    view.setUint32(pos + 42, entry.offset, true); // local header offset
    pos += 46;

    bytes.set(entry.nameBytes, pos);
    pos += entry.nameBytes.length;
  });

  // End of Central Directory Record PK\x05\x06
  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true); // number of this disk
  view.setUint16(pos + 6, 0, true); // disk where central directory starts
  view.setUint16(pos + 8, encodedEntries.length, true);
  view.setUint16(pos + 10, encodedEntries.length, true);
  view.setUint32(pos + 12, centralSize, true);
  view.setUint32(pos + 16, centralDirOffset, true);
  view.setUint16(pos + 20, 0, true); // comment length

  return bytes;
}

export function createStudioXlsxWorkbook(sheets: StudioWorksheetSpec[]): Uint8Array {
  const validSheets = sheets.length > 0 ? sheets : [{ name: 'Sheet1', headers: ['Status'], rows: [] }];
  const usedNames = new Set<string>();

  const normalizedSheets = validSheets.map((sheet, idx) => {
    let candidate = sanitizeSheetName(sheet.name, idx + 1);
    if (usedNames.has(candidate.toLowerCase())) {
      candidate = `${candidate.slice(0, 27)} (${idx + 1})`;
    }
    usedNames.add(candidate.toLowerCase());
    return {
      ...sheet,
      safeName: candidate,
      sheetId: idx + 1,
      relId: `rId${idx + 1}`,
      fileName: `sheet${idx + 1}.xml`,
    };
  });

  const contentTypesXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ...normalizedSheets.map(
      (sheet) =>
        `<Override PartName="/xl/worksheets/${sheet.fileName}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ),
    '</Types>',
  ].join('');

  const rootRelsXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>',
  ].join('');

  const workbookXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets>',
    ...normalizedSheets.map(
      (sheet) => `<sheet name="${escapeXml(sheet.safeName)}" sheetId="${sheet.sheetId}" r:id="${sheet.relId}"/>`
    ),
    '</sheets>',
    '</workbook>',
  ].join('');

  const workbookRelsXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...normalizedSheets.map(
      (sheet) =>
        `<Relationship Id="${sheet.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${sheet.fileName}"/>`
    ),
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '</Relationships>',
  ].join('');

  const stylesXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="2">',
    '<font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
    '</fonts>',
    '<fills count="3">',
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFBE123C"/><bgColor indexed="64"/></patternFill></fill>',
    '</fills>',
    '<borders count="2">',
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>',
    '</borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="2">',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>',
    '</cellXfs>',
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    '</styleSheet>',
  ].join('');

  const files: Array<{ path: string; content: string }> = [
    { path: '[Content_Types].xml', content: contentTypesXml },
    { path: '_rels/.rels', content: rootRelsXml },
    { path: 'xl/workbook.xml', content: workbookXml },
    { path: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
    { path: 'xl/styles.xml', content: stylesXml },
    ...normalizedSheets.map((sheet) => ({
      path: `xl/worksheets/${sheet.fileName}`,
      content: buildWorksheetXml(sheet.headers, sheet.rows),
    })),
  ];

  return buildZipArchive(files);
}

export function createStudioXlsx(sheetName: string, headers: string[], rows: unknown[][]): Uint8Array {
  return createStudioXlsxWorkbook([{ name: sheetName, headers, rows }]);
}
