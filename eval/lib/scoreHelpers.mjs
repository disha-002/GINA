/**
 * Shared scoring helpers for run-manifest (and tests).
 * Default numeric tolerances match eval/README.md.
 */

export const DEFAULT_SCALAR_ABS_TOL = Number.parseFloat(
  process.env.EVAL_DEFAULT_SCALAR_ABS_TOL ?? '0.02',
);
export const DEFAULT_TABLE_ABS_TOL = Number.parseFloat(
  process.env.EVAL_DEFAULT_TABLE_ABS_TOL ?? '0.02',
);

/**
 * Known equivalent aggregate column names (different SQL aliases for the same measure).
 * Used when gold JSON uses one name and the API returns another.
 */
const AGGREGATE_KEY_GROUPS = [
  ['sum_revenue', 'total_revenue', 'revenue_total'],
  ['avg_revenue', 'average_order_revenue', 'average_revenue'],
  ['total_quantity', 'total_quantity_sold', 'sum_quantity'],
  ['avg_discount', 'average_discount_percent', 'average_discount', 'avg_discount_percent'],
];

/** Alternates in the same semantic group as `expectedKey` (case-insensitive match on group). */
function equivalentAlternates(expectedKey) {
  const k = String(expectedKey).trim();
  const lower = k.toLowerCase();
  for (const g of AGGREGATE_KEY_GROUPS) {
    const idx = g.findIndex((x) => x.toLowerCase() === lower);
    if (idx >= 0) return g.filter((_, i) => i !== idx);
  }
  return [];
}

/**
 * Resolve a cell from `actual` for an expected column name: exact key, manifest aliases, then known equivalents.
 * @param {Record<string, string>} actual
 * @param {string} expectedKey
 * @param {Record<string, string[]>} [columnAliases] optional per-manifest overrides from expect.result.column_aliases
 * @returns {string|number|undefined}
 */
export function pickCellForExpectedKey(actual, expectedKey, columnAliases = {}) {
  if (!actual || typeof actual !== 'object') return undefined;
  const candidates = [
    expectedKey,
    ...(columnAliases[expectedKey] ?? []),
    ...equivalentAlternates(expectedKey),
  ];
  const keys = Object.keys(actual);
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(actual, c)) {
      const v = actual[c];
      if (v !== undefined && v !== '') return v;
    }
  }
  for (const c of candidates) {
    const found = keys.find((k) => k.toLowerCase() === String(c).toLowerCase());
    if (found !== undefined) {
      const v = actual[found];
      if (v !== undefined && v !== '') return v;
    }
  }
  return undefined;
}

export function sameNumber(a, b, absTol = 0, relTol = 0) {
  const d = Math.abs(a - b);
  if (d <= absTol) return true;
  if (relTol > 0 && Math.abs(b) > 1e-12 && d / Math.abs(b) <= relTol) return true;
  return false;
}

export function parseNumericCell(s) {
  const t = String(s ?? '').trim().replace(/[$£€,]/g, '');
  if (t === '') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string|number} actualStr
 * @param {string|number} expectedStr
 * @param {number} tableAbsTol
 */
export function cellMatches(actualStr, expectedStr, tableAbsTol) {
  const a = typeof actualStr === 'number' ? actualStr : parseNumericCell(actualStr);
  const e = typeof expectedStr === 'number' ? expectedStr : parseNumericCell(expectedStr);
  if (a !== null && e !== null) {
    return sameNumber(a, e, tableAbsTol, 0);
  }
  return String(actualStr ?? '').trim() === String(expectedStr ?? '').trim();
}

/**
 * Compare cells for keys present in the expected row only (API may return extra columns).
 * @param {Record<string, string>} actual
 * @param {Record<string, unknown>} expected
 * @param {number} tableAbsTol
 * @param {{ columnAliases?: Record<string, string[]> }} [options]
 */
export function rowMatchesExpected(actual, expected, tableAbsTol, options = {}) {
  const columnAliases = options.columnAliases ?? {};
  for (const k of Object.keys(expected)) {
    const raw = pickCellForExpectedKey(actual, k, columnAliases);
    if (!cellMatches(raw, expected[k], tableAbsTol)) return false;
  }
  return true;
}

/**
 * @param {number} actual
 * @param {{ value: unknown; abs_tol?: number; rel_tol?: number; compare_as?: string }} expect
 */
export function scalarOk(actual, expect) {
  let a = actual;
  if (
    expect.compare_as === 'fraction_as_percent' &&
    typeof expect.value === 'number' &&
    typeof actual === 'number'
  ) {
    // Gold is 0–100 (e.g. 12); model returned a fraction 0–1 (e.g. 0.12).
    if (expect.value > 1 && actual >= 0 && actual <= 1) {
      a = actual * 100;
    }
  }

  const v = expect.value;
  if (typeof v === 'number') {
    const abs =
      expect.abs_tol !== undefined && expect.abs_tol !== null ? expect.abs_tol : DEFAULT_SCALAR_ABS_TOL;
    const rel = expect.rel_tol ?? 0;
    return sameNumber(a, v, abs, rel);
  }
  if (typeof v === 'boolean') return a === v;
  return String(a).trim() === String(v).trim();
}

export function relevantColumnsSubset(expected, actual) {
  if (!Array.isArray(actual)) return false;
  const aset = new Set(actual.map(String));
  return expected.every((c) => aset.has(String(c)));
}
