import Papa from 'papaparse';

export interface ParsedCSV {
  /** Trimmed CSV header names (raw, used as columnName in profiles). */
  headers: string[];
  /** One object per row, keyed by original header. */
  rows: Record<string, string>[];
}

/**
 * Decode CSV bytes to text. Handles UTF-8 (with/without BOM), UTF-16 LE/BE (Excel “Unicode CSV”).
 */
export function bufferToCsvText(buf: Buffer): string {
  if (buf.length === 0) return '';

  // UTF-16 LE BOM (common for Excel “Unicode text”)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString('utf16le');
  }

  // UTF-16 BE BOM
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const body = buf.slice(2);
    if (body.length >= 2 && body.length % 2 === 0) {
      body.swap16();
      return body.toString('utf16le');
    }
  }

  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) {
    s = s.slice(1);
  }
  return s;
}

/**
 * Parse a CSV string using PapaParse.
 * Headers are trimmed; empty lines are skipped.
 */
export function parseCSV(csvText: string): ParsedCSV {
  let text = csvText;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  const headers = result.meta.fields ?? [];
  return { headers, rows: result.data };
}
