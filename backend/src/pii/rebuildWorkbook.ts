import * as XLSX from 'xlsx';
import type { ParsedSheet } from '../ingestion/parseUploadFile.js';

/** Excel sheet names: max 31 chars; cannot contain : \ / ? * [ ] */
function sanitizeSheetName(name: string, index: number): string {
  let s = name.replace(/[:\\/?*[\]]/g, '_').slice(0, 31);
  if (!s.trim()) s = `Sheet${index + 1}`;
  return s;
}

/**
 * Build an .xlsx buffer from redacted per-sheet CSV strings (for S3; no raw PII at rest).
 */
export function redactedSheetsToXlsxBuffer(sheets: ParsedSheet[]): Buffer {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  sheets.forEach((s, i) => {
    let base = sanitizeSheetName(s.sheetName, i);
    let finalName = base;
    let n = 2;
    while (used.has(finalName)) {
      const suffix = ` (${n})`;
      finalName = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
      n++;
    }
    used.add(finalName);
    const tmp = XLSX.read(s.csv, { type: 'string' });
    const first = tmp.SheetNames[0];
    if (!first) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), finalName);
      return;
    }
    const ws = tmp.Sheets[first];
    XLSX.utils.book_append_sheet(wb, ws, finalName);
  });

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
