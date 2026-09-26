import type { ColumnProfile } from '../semantic/profiler.js';
import type { ResultRow } from './dbExecutor.js';
import { executeReadOnlySql } from './dbExecutor.js';
import type pg from 'pg';

/** §6.5 — keywords that signal an "explain the delta" intent. */
const EXPLAIN_KEYWORDS = [
  'why',
  'what caused',
  'what drove',
  'what changed',
  'what contributed',
  'reason',
];

function hasExplainIntent(question: string): boolean {
  const q = question.toLowerCase();
  return EXPLAIN_KEYWORDS.some((kw) => q.includes(kw));
}

/**
 * Compute the relative delta of a numeric result set.
 * Returns 0 if there are fewer than 2 numeric values or the base is 0.
 */
export function computeNumericDelta(rows: ResultRow[]): number {
  if (rows.length < 2) return 0;

  const numericKey = Object.keys(rows[0] ?? {}).find((k) => {
    const v = rows[0]![k];
    return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)));
  });
  if (!numericKey) return 0;

  const values = rows
    .map((r) => parseFloat(String(r[numericKey] ?? 'NaN')))
    .filter((v) => !isNaN(v));
  if (values.length < 2) return 0;

  const first = values[0]!;
  const last = values[values.length - 1]!;
  if (first === 0) return 0;
  return Math.abs((last - first) / first);
}

/**
 * §6.5 — Find the category column with the highest cardinality from `columns`.
 * This is the column used for GROUP BY decomposition.
 */
function highestCardinalityCategory(columns: ColumnProfile[]): ColumnProfile | undefined {
  return columns
    .filter((c) => c.semanticType === 'category')
    .sort((a, b) => (b.uniqueCount ?? 0) - (a.uniqueCount ?? 0))[0];
}

/** Build a GROUP BY decomposition query on `groupByCol` with an optional numeric sum. */
function buildDecompositionSql(
  tableName: string,
  groupByCol: ColumnProfile,
  amountCol: ColumnProfile | undefined,
): string {
  const qIdent = (n: string) => `"${n.replace(/"/g, '""')}"`;
  const t = qIdent(tableName);
  const g = qIdent(groupByCol.columnName);

  if (amountCol) {
    const a = qIdent(amountCol.columnName);
    return `SELECT ${g}, SUM(${a}) AS total FROM ${t} GROUP BY ${g} ORDER BY total DESC LIMIT 10`;
  }
  return `SELECT ${g}, COUNT(*) AS count FROM ${t} GROUP BY ${g} ORDER BY count DESC LIMIT 10`;
}

export type SecondaryQueryResult = {
  fired: boolean;
  rows: ResultRow[];
  sql: string | null;
};

/**
 * §6.5 — Run secondary GROUP BY decomposition query when BOTH:
 *   1. `primaryDelta` exceeds the configured threshold, AND
 *   2. The user question contains an "explain" keyword.
 */
export async function runSecondaryQuery(params: {
  pool: pg.Pool;
  question: string;
  tableName: string;
  columns: ColumnProfile[];
  primaryRows: ResultRow[];
}): Promise<SecondaryQueryResult> {
  const { pool, question, tableName, columns, primaryRows } = params;

  const delta = computeNumericDelta(primaryRows);
  const threshold = Number(process.env['SECONDARY_QUERY_DELTA_THRESHOLD'] ?? 0.05);

  if (delta <= threshold || !hasExplainIntent(question)) {
    return { fired: false, rows: [], sql: null };
  }

  const groupByCol = highestCardinalityCategory(columns);
  if (!groupByCol) {
    return { fired: false, rows: [], sql: null };
  }

  const amountCol = columns.find((c) => c.semanticType === 'amount');
  const sql = buildDecompositionSql(tableName, groupByCol, amountCol);

  const result = await executeReadOnlySql(pool, sql);
  return { fired: true, rows: result.rows, sql };
}
