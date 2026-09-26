import type { ParsedCSV } from '../utils/csvParser.js';

export type SemanticType = 'amount' | 'date' | 'category' | 'identifier' | 'flag' | 'text';
export type PostgresType = 'DATE' | 'NUMERIC' | 'TEXT';

export interface ColumnProfile {
  /** Raw CSV header (trimmed, double-quotes stripped — used as the actual DB column name). */
  columnName: string;
  /** PostgreSQL column type used when creating the dynamic table. */
  postgresType: PostgresType;
  /** Human-readable label. Set to raw header initially; enricher overwrites in Phase 2B. */
  businessLabel: string;
  /** Semantic role of the column. Enricher may refine in Phase 2B. */
  semanticType: SemanticType;
  /** Detected currency symbol, only when semanticType === 'amount'. */
  currency: 'GBP' | 'USD' | 'EUR' | null;
  /** One-sentence description. Empty until enricher runs in Phase 2B. */
  description: string;
  /** 3–5 representative non-null values. */
  sampleValues: string[];
  /** Percentage of rows where this column is null/empty (0–100). */
  nullPct: number;
  /** Count of distinct non-null values in the full dataset. */
  uniqueCount: number;
  /** Min/max for NUMERIC and DATE columns; null for TEXT. */
  valueRange: { min: string; max: string } | null;
}

// ── Pattern helpers ──────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/;
const UK_DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY_PREFIX_RE = /^([£$€])/;

/** Booleans in any casing that indicate a flag column. */
const FLAG_VALUES = new Set(['y', 'n', 'yes', 'no', 'true', 'false', '1', '0']);

function isParseableDate(v: string): boolean {
  const s = v.trim();
  if (ISO_DATE_RE.test(s)) {
    return !isNaN(new Date(s).getTime());
  }
  if (UK_DATE_RE.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    return !isNaN(new Date(`${yyyy}-${mm}-${dd}`).getTime());
  }
  return false;
}

function toNumeric(v: string): number | null {
  const stripped = v.trim().replace(/^[£$€]\s*/, '').replace(/,/g, '');
  const n = parseFloat(stripped);
  return isNaN(n) ? null : n;
}

function detectCurrency(nonNullSamples: string[]): 'GBP' | 'USD' | 'EUR' | null {
  for (const v of nonNullSamples) {
    const m = CURRENCY_PREFIX_RE.exec(v.trim());
    if (m) {
      if (m[1] === '£') return 'GBP';
      if (m[1] === '$') return 'USD';
      if (m[1] === '€') return 'EUR';
    }
  }
  return null;
}

function pickSampleValues(allNonNull: string[], n = 5): string[] {
  if (allNonNull.length === 0) return [];
  // Space samples evenly across the dataset for variety
  const step = Math.max(1, Math.floor(allNonNull.length / n));
  const samples: string[] = [];
  for (let i = 0; i < allNonNull.length && samples.length < n; i += step) {
    samples.push(allNonNull[i].trim());
  }
  return samples;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Profile each column in the parsed CSV.
 *
 * Type detection runs on up to 200 rows (spec §5.3 step 2a).
 * Detection thresholds (spec §3.2):
 *   - ≥80% parseable as date  → DATE
 *   - ≥80% parseable as numeric (strip £/$€/commas) → NUMERIC
 *   - Exactly 2 unique flag-variant values → TEXT (flag semanticType)
 *   - UUID pattern → TEXT (identifier semanticType)
 *   - All else → TEXT
 */
export function profileColumns(parsed: ParsedCSV): ColumnProfile[] {
  const { headers, rows } = parsed;
  const SAMPLE_LIMIT = 200;
  const sampleRows = rows.slice(0, SAMPLE_LIMIT);
  const totalCount = rows.length;

  return headers.map((header) => {
    // Sanitize: strip double-quotes so they can't break quoted DDL identifiers
    const columnName = header.replace(/"/g, '').trim();

    // All values (for uniqueCount / nullPct / range over full file)
    const allValues: string[] = rows.map((r) => r[header] ?? '');
    const allNonNull: string[] = allValues.filter((v) => v.trim() !== '');

    // Sample values (for type detection — at most 200 rows)
    const sampleValues: string[] = sampleRows.map((r) => r[header] ?? '');
    const sampleNonNull: string[] = sampleValues.filter((v) => v.trim() !== '');

    // ── Null / unique stats ──────────────────────────────────────────────────
    const nullCount = totalCount - allNonNull.length;
    const nullPct = totalCount > 0 ? Math.round((nullCount / totalCount) * 100) : 0;

    const uniqueSet = new Set(allNonNull.map((v) => v.trim()));
    const uniqueCount = uniqueSet.size;

    // ── Type detection ───────────────────────────────────────────────────────
    let dateParseable = 0;
    let numericParseable = 0;
    for (const v of sampleNonNull) {
      if (isParseableDate(v)) {
        dateParseable++;
      } else if (toNumeric(v) !== null) {
        numericParseable++;
      }
    }

    const sampleTotal = sampleNonNull.length;
    let postgresType: PostgresType = 'TEXT';
    if (sampleTotal > 0) {
      if (dateParseable / sampleTotal >= 0.8) {
        postgresType = 'DATE';
      } else if (numericParseable / sampleTotal >= 0.8) {
        postgresType = 'NUMERIC';
      }
    }

    // ── Flag / UUID detection ────────────────────────────────────────────────
    const uniqueArr = [...uniqueSet];
    const isFlag =
      uniqueCount === 2 && uniqueArr.every((v) => FLAG_VALUES.has(v.toLowerCase()));
    const isUUID = uniqueArr.some((v) => UUID_RE.test(v));

    // ── Semantic type ────────────────────────────────────────────────────────
    let semanticType: SemanticType;
    if (postgresType === 'DATE') {
      semanticType = 'date';
    } else if (postgresType === 'NUMERIC') {
      semanticType = 'amount';
    } else if (isFlag) {
      semanticType = 'flag';
    } else if (isUUID) {
      semanticType = 'identifier';
    } else if (uniqueCount < 20 || (totalCount > 0 && uniqueCount / totalCount < 0.05)) {
      semanticType = 'category';
    } else {
      semanticType = 'text';
    }

    // ── Currency detection (NUMERIC columns only) ────────────────────────────
    const currency =
      postgresType === 'NUMERIC' ? detectCurrency(sampleNonNull) : null;

    // ── Display sample values (3–5 varied, non-null) ─────────────────────────
    const displaySamples = pickSampleValues(allNonNull, 5);

    // ── Value range ──────────────────────────────────────────────────────────
    let valueRange: { min: string; max: string } | null = null;

    if (postgresType === 'DATE') {
      const dates = allNonNull
        .filter((v) => isParseableDate(v.trim()))
        .map((v) => {
          const s = v.trim();
          if (UK_DATE_RE.test(s)) {
            const [dd, mm, yyyy] = s.split('/');
            return new Date(`${yyyy}-${mm}-${dd}`);
          }
          return new Date(s);
        })
        .sort((a, b) => a.getTime() - b.getTime());

      if (dates.length > 0) {
        valueRange = {
          min: dates[0].toISOString().split('T')[0],
          max: dates[dates.length - 1].toISOString().split('T')[0],
        };
      }
    } else if (postgresType === 'NUMERIC') {
      const nums = allNonNull
        .map((v) => toNumeric(v))
        .filter((n): n is number => n !== null);
      if (nums.length > 0) {
        valueRange = {
          min: String(Math.min(...nums)),
          max: String(Math.max(...nums)),
        };
      }
    }

    return {
      columnName,
      postgresType,
      businessLabel: columnName,
      semanticType,
      currency,
      description: '',
      sampleValues: displaySamples,
      nullPct,
      uniqueCount,
      valueRange,
    };
  });
}

// ── Row coercion for INSERT ──────────────────────────────────────────────────

/**
 * Coerce a raw CSV string value to the appropriate type for PostgreSQL insertion.
 * Returns null for empty / unparseable values — PostgreSQL will store NULL.
 */
export function coerceValue(
  raw: string,
  postgresType: PostgresType,
): string | number | null {
  if (!raw || raw.trim() === '') return null;

  switch (postgresType) {
    case 'NUMERIC': {
      const n = toNumeric(raw);
      return n;
    }
    case 'DATE': {
      const s = raw.trim();
      if (UK_DATE_RE.test(s)) {
        const [dd, mm, yyyy] = s.split('/');
        return `${yyyy}-${mm}-${dd}`;
      }
      return s;
    }
    default:
      return raw;
  }
}
