import Papa from 'papaparse';
import type { PiiRedactionItem, PiiSheetResult } from './types.js';

/** Substrings in normalised header names — high-confidence PII (still checked per cell for value rules). */
const HEADER_PATTERNS = [
  'name',
  'email',
  'phone',
  'mobile',
  'tel',
  'dob',
  'birth',
  'ssn',
  'nino',
  'nin',
  'nationalinsurance',
  'address',
  'postcode',
  'pincode',
  'account',
  'sortcode',
  'salary',
  'gender',
  'passport',
  'ifsc',
  'aadhaar',
  'aadhar',
  'gstin',
  'pancard',
  'panno',
];

function isLikelyTemporalAnalyticsColumn(headerNormalised: string): boolean {
  const h = headerNormalised;
  if (h.endsWith('date') || h.endsWith('time')) return true;
  if (h.includes('timestamp')) return true;
  return false;
}

function looksLikeDateOrPlainDatetime(value: string): boolean {
  const v = value.trim();
  if (!v) return false;

  if (/^\d{4}-\d{2}-\d{2}([T\s].*)?$/.test(v)) return true;
  if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(v)) return true;
  if (/^\d{4}[\/.\-]\d{2}[\/.\-]\d{2}$/.test(v)) return true;

  if (/^\d{8}$/.test(v)) {
    const y = Number.parseInt(v.slice(0, 4), 10);
    const mo = Number.parseInt(v.slice(4, 6), 10);
    const d = Number.parseInt(v.slice(6, 8), 10);
    if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return true;
    }
  }

  return false;
}

const VALUE_REGEXES = {
  REDACTED_EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/i,
  REDACTED_PHONE:
    /^(?:\+91|0091)[\s.-]*[6-9]\d{9}$|^0[6-9]\d{9}$|^[6-9]\d{9}$/,
  REDACTED_POSTCODE: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$|^[1-9]\d{5}$/i,
  REDACTED_ID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  REDACTED_SORT_CODE: /^\d{2}-\d{2}-\d{2}$/,
  REDACTED_IFSC: /^[A-Z]{4}0[A-Z0-9]{6}$/i,
  REDACTED_PAN: /^[A-Z]{5}[0-9]{4}[A-Z]$/i,
  REDACTED_NI: /^[A-Z]{2}\d{6}[A-Z]$/i,
  REDACTED_AADHAAR: /^\d{4}\s\d{4}\s\d{4}$/,
  REDACTED_ACCOUNT: /^\d{8}$/,
} as const;

type ValueRedactionTag = keyof typeof VALUE_REGEXES;
type ColumnRedactionTag = 'REDACTED_CONFIDENTIAL' | ValueRedactionTag;

function reasonForTag(tag: ColumnRedactionTag, headerMatch: boolean): string {
  if (headerMatch) return 'Column name suggests personal or sensitive data';
  if (tag === 'REDACTED_CONFIDENTIAL') return 'Column name suggests personal or sensitive data';
  return `Cell values matched ${tag.replace('REDACTED_', '').toLowerCase().replace(/_/g, ' ')} pattern`;
}

/**
 * Heuristic PII shield (ported from frontend `runPIIShield`). Deterministic; safe fallback when the agent fails.
 */
export function runShieldFallbackCsv(csv: string, columnKeyPrefix: string): PiiSheetResult {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse error: ${parsed.errors[0]?.message ?? 'unknown'}`);
  }

  const rows = parsed.data;
  const headers = parsed.meta.fields ?? [];

  let totalRedactions = 0;
  const redactedColumnsSet = new Set<string>();

  const columnDefs = headers.map((header) => {
    const lowerHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isHeaderMatch = HEADER_PATTERNS.some((p) => lowerHeader.includes(p));
    const skipValueHeuristics = isLikelyTemporalAnalyticsColumn(lowerHeader);
    return {
      header,
      isHeaderMatch,
      skipValueHeuristics,
      redactionType: (isHeaderMatch ? 'REDACTED_CONFIDENTIAL' : null) as ColumnRedactionTag | null,
    };
  });

  const scanLimit = Math.min(rows.length, 50);
  for (const col of columnDefs) {
    if (col.isHeaderMatch) continue;
    if (col.skipValueHeuristics) continue;

    for (let i = 0; i < scanLimit; i++) {
      const val = String(rows[i]?.[col.header] ?? '').trim();
      if (!val) continue;
      if (looksLikeDateOrPlainDatetime(val)) continue;

      let matchedType: ColumnRedactionTag | null = null;
      for (const type of Object.keys(VALUE_REGEXES) as ValueRedactionTag[]) {
        const regex = VALUE_REGEXES[type];
        if (type === 'REDACTED_ACCOUNT' && /^\d{8}$/.test(val)) {
          const y = Number.parseInt(val.slice(0, 4), 10);
          const mo = Number.parseInt(val.slice(4, 6), 10);
          const d = Number.parseInt(val.slice(6, 8), 10);
          if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
            continue;
          }
        }
        if (regex.test(val)) {
          matchedType = type;
          break;
        }
      }

      if (matchedType) {
        col.redactionType = matchedType;
        break;
      }
    }
  }

  columnDefs.forEach((col) => {
    if (col.redactionType) {
      redactedColumnsSet.add(col.header);
    }
  });

  const items: PiiRedactionItem[] = [];
  for (const col of columnDefs) {
    if (!col.redactionType) continue;
    const key =
      columnKeyPrefix === '_' ? col.header : `${columnKeyPrefix}: ${col.header}`;
    items.push({
      columnKey: key,
      reason: reasonForTag(col.redactionType, col.isHeaderMatch),
      label: col.redactionType,
    });
  }

  const finalRows = rows.map((row) => {
    const newRow: Record<string, string> = { ...row };

    for (const col of columnDefs) {
      if (col.redactionType && newRow[col.header] && String(newRow[col.header]).trim() !== '') {
        newRow[col.header] = `[${col.redactionType}]`;
        totalRedactions++;
      }
    }
    return newRow;
  });

  const redactedCsv = Papa.unparse(finalRows);

  return {
    redactedCsv,
    redactedColumns: Array.from(redactedColumnsSet),
    totalRedactions,
    items,
    method: 'fallback',
  };
}
