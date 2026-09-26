import type { ColumnProfile } from '../semantic/profiler.js';

/**
 * §6.4 — deterministic templates + semantic-type column binding.
 * Not used by the live query pipeline (`generateSql`); kept for tests/seeds and `quotePgIdent` helpers.
 */

/** Double-quote a PostgreSQL identifier (matches dynamic dataset column names from CSV headers). */
export function quotePgIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export type SemanticBind = {
  amount?: string;
  category?: string;
  date?: string;
};

export function bindSemanticColumns(columns: ColumnProfile[]): SemanticBind {
  const amount = columns.find((c) => c.semanticType === 'amount')?.columnName;
  const category = columns.find((c) => c.semanticType === 'category')?.columnName;
  const date = columns.find((c) => c.semanticType === 'date')?.columnName;
  return { amount, category, date };
}

function hasAny(hay: string, needles: string[]): boolean {
  const h = hay.toLowerCase();
  return needles.some((n) => h.includes(n));
}

const KW_TOP_N = ['top', 'most', 'highest', 'largest', 'best', 'biggest'];
const KW_SUM = ['total', 'sum', 'how much', 'overall', 'all'];
const KW_COMPARE = ['compare', 'vs', 'versus', 'difference', 'between'];
const KW_TREND = ['over time', 'month', 'monthly', 'weekly', 'trend', 'changed'];
const KW_COUNT = ['how many', 'count', 'number of'];

function matchTopN(q: string): boolean {
  return hasAny(q, KW_TOP_N);
}
function matchSum(q: string): boolean {
  return hasAny(q, KW_SUM);
}
function matchCompare(q: string): boolean {
  return hasAny(q, KW_COMPARE);
}
function matchTrend(q: string): boolean {
  return hasAny(q, KW_TREND);
}
function matchCount(q: string): boolean {
  return hasAny(q, KW_COUNT);
}

/**
 * First matching template wins (table order in §6.4).
 * Returns `null` if no template matches or required columns are missing.
 */
export function tryTemplateSql(
  question: string,
  tableName: string,
  columns: ColumnProfile[],
): string | null {
  const q = question.trim();
  const t = quotePgIdent(tableName);
  const b = bindSemanticColumns(columns);

  if (matchTopN(q) && b.category && b.amount) {
    return `SELECT ${quotePgIdent(b.category)}, SUM(${quotePgIdent(b.amount)}) AS total FROM ${t} GROUP BY ${quotePgIdent(
      b.category,
    )} ORDER BY total DESC LIMIT 5`;
  }

  if (matchSum(q) && b.amount) {
    return `SELECT SUM(${quotePgIdent(b.amount)}) AS total FROM ${t}`;
  }

  if (matchCompare(q) && b.category && b.amount) {
    return `SELECT ${quotePgIdent(b.category)}, SUM(${quotePgIdent(b.amount)}) AS total FROM ${t} GROUP BY ${quotePgIdent(
      b.category,
    )}`;
  }

  if (matchTrend(q) && b.date && b.amount) {
    return `SELECT DATE_TRUNC('month', ${quotePgIdent(b.date)}::date) AS period, SUM(${quotePgIdent(
      b.amount,
    )}) AS total FROM ${t} GROUP BY period ORDER BY period`;
  }

  if (matchCount(q)) {
    return `SELECT COUNT(*) AS count FROM ${t}`;
  }

  return null;
}
