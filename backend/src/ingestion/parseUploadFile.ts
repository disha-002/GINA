import * as XLSX from 'xlsx';
import { bufferToCsvText } from '../utils/csvParser.js';

export type ParsedSheet = { sheetName: string; csv: string };

/**
 * Parse an uploaded CSV or Excel buffer into per-sheet CSV strings.
 */
export function parseUploadToSheets(fileBuffer: Buffer, filename: string): ParsedSheet[] {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.csv')) {
    const csv = bufferToCsvText(fileBuffer);
    return [{ sheetName: '_', csv }];
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(fileBuffer, { type: 'buffer' });
    const out: ParsedSheet[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const csv = XLSX.utils.sheet_to_csv(ws);
      if (!csv.trim()) continue;
      out.push({ sheetName, csv });
    }
    if (out.length === 0) {
      throw new Error('NO_SHEETS');
    }
    return out;
  }

  throw new Error('UNSUPPORTED_FILE_TYPE');
}
