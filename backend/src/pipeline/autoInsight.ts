import type { ColumnProfile } from '../semantic/profiler.js';
import type { SqlGenerationPath } from './sqlGenerator.js';
import type { ResultRow } from './dbExecutor.js';
import type { PlannerIntent } from './planner.js';

// ─── Chart Type ──────────────────────────────────────────────────────────────

export type ChartType =
  | 'big_number'
  | 'line'
  | 'grouped_bar'
  | 'stacked_bar'
  | 'bar'
  | 'table';

function hasDateColumn(rows: ResultRow[]): boolean {
  if (rows.length === 0) return false;
  return Object.keys(rows[0]!).some((k) => {
    const lower = k.toLowerCase();
    return lower.includes('date') || lower.includes('month') || lower.includes('period')
      || lower.includes('week') || lower.includes('year') || lower.includes('quarter');
  });
}

function hasPercentageColumn(rows: ResultRow[]): boolean {
  if (rows.length === 0) return false;
  return Object.keys(rows[0]!).some((k) => k.toLowerCase().includes('pct') || k.toLowerCase().includes('percent'));
}

function hasCategoryAndNumeric(rows: ResultRow[]): boolean {
  if (rows.length === 0) return false;
  const keys = Object.keys(rows[0]!);
  const hasCategory = keys.some((k) => {
    const v = rows[0]![k];
    return typeof v === 'string' && isNaN(Number(v));
  });
  const hasNumeric = keys.some((k) => {
    const v = rows[0]![k];
    return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)));
  });
  return hasCategory && hasNumeric;
}

/** §9 — Infer chart type from result shape and planner intent. */
export function selectChartType(
  rows: ResultRow[],
  intent: PlannerIntent | undefined,
  _question: string,
): ChartType {
  if (rows.length === 1 && Object.keys(rows[0]!).length === 1) return 'big_number';
  if (intent === 'follow_up_cache' && rows.length === 1) return 'big_number';
  if (intent === 'simple_query' && hasDateColumn(rows)) return 'line';
  if (hasDateColumn(rows)) return 'line';
  if (intent === 'complex_query' && rows.length === 2) return 'grouped_bar';
  if (hasPercentageColumn(rows)) return 'stacked_bar';
  if (rows.length > 1 && hasCategoryAndNumeric(rows)) return 'bar';
  return 'table';
}

// ─── AutoInsight Detection ────────────────────────────────────────────────────

function getNumericValues(rows: ResultRow[], key: string): number[] {
  return rows
    .map((r) => parseFloat(String(r[key] ?? 'NaN')))
    .filter((v) => !isNaN(v));
}

function firstNumericKey(rows: ResultRow[]): string | null {
  if (rows.length === 0) return null;
  return (
    Object.keys(rows[0]!).find((k) => {
      const v = rows[0]![k];
      return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)));
    }) ?? null
  );
}

function firstStringKey(rows: ResultRow[]): string | null {
  if (rows.length === 0) return null;
  return (
    Object.keys(rows[0]!).find((k) => {
      const v = rows[0]![k];
      return typeof v === 'string' && isNaN(Number(v));
    }) ?? null
  );
}

/**
 * Format a number for display — abbreviate large values.
 */
function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/** §6.7 Concentration: top item > 50% of total. */
function detectConcentration(rows: ResultRow[]): string | null {
  if (rows.length < 2) return null;
  const numKey = firstNumericKey(rows);
  const labelKey = firstStringKey(rows);
  if (!numKey) return null;

  const values = getNumericValues(rows, numKey);
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const topValue = values[0]!;
  const pct = topValue / total;
  if (pct > 0.5) {
    const topLabel = labelKey ? String(rows[0]![labelKey]) : 'The top item';
    const pctStr = Math.round(pct * 100);
    return `${topLabel} = ${pctStr}% of total`;
  }
  return null;
}

/** §6.7 Trend: consistent direction across ≥3 periods. */
function detectTrend(rows: ResultRow[]): string | null {
  if (rows.length < 3) return null;
  const numKey = firstNumericKey(rows);
  if (!numKey) return null;

  const values = getNumericValues(rows, numKey);
  if (values.length < 3) return null;

  let increasing = 0;
  let decreasing = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[i - 1]!) increasing++;
    else if (values[i]! < values[i - 1]!) decreasing++;
  }

  const steps = values.length - 1;
  if (increasing === steps) {
    return `Increasing trend: ${fmt(values[0]!)} → ${fmt(values[values.length - 1]!)}`;
  }
  if (decreasing === steps) {
    return `Decreasing trend: ${fmt(values[0]!)} → ${fmt(values[values.length - 1]!)}`;
  }
  return null;
}

/** §6.7 Anomaly: value > 2 standard deviations from mean. */
function detectAnomaly(rows: ResultRow[]): string | null {
  const numKey = firstNumericKey(rows);
  if (!numKey || rows.length < 3) return null;

  const values = getNumericValues(rows, numKey);
  if (values.length < 3) return null;

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdev = Math.sqrt(variance);
  if (stdev === 0) return null;

  for (let i = 0; i < values.length; i++) {
    const z = Math.abs((values[i]! - mean) / stdev);
    if (z > 2) {
      const direction = values[i]! > mean ? 'above' : 'below';
      const labelKey = firstStringKey(rows);
      const label = labelKey ? String(rows[i]![labelKey]) : numKey;
      return `${label}: ${fmt(values[i]!)} is significantly ${direction} average`;
    }
  }
  return null;
}

/** §6.7 Contradiction: two amount-like columns in 1-row result that diverge by >20%. */
function detectContradiction(rows: ResultRow[]): string | null {
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  const numericKeys = Object.keys(row).filter((k) => {
    const v = row[k];
    return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)));
  });
  if (numericKeys.length < 2) return null;

  const [k1, k2] = numericKeys;
  const v1 = parseFloat(String(row[k1!]));
  const v2 = parseFloat(String(row[k2!]));

  if (v1 === 0 || isNaN(v1) || isNaN(v2)) return null;
  const divergePct = Math.abs((v2 - v1) / v1);
  if (divergePct > 0.2) {
    return `${k1} and ${k2} diverge by ${Math.round(divergePct * 100)}%`;
  }
  return null;
}

/** §6.7 — Run all 4 insight rules and return fired insights. */
export function detectAutoInsights(
  rows: ResultRow[],
  _columns: ColumnProfile[],
): string[] {
  const insights: string[] = [];

  const concentration = detectConcentration(rows);
  if (concentration) insights.push(concentration);

  const trend = detectTrend(rows);
  if (trend) insights.push(trend);

  const anomaly = detectAnomaly(rows);
  if (anomaly) insights.push(anomaly);

  const contradiction = detectContradiction(rows);
  if (contradiction) insights.push(contradiction);

  return insights;
}

// ─── Confidence Score ─────────────────────────────────────────────────────────

/** §6.8 — Compute a 0–100 confidence score for the generated answer. */
export function computeConfidence(
  rows: ResultRow[],
  sqlPath: SqlGenerationPath,
  relevantColumns: ColumnProfile[],
): number {
  let score = 100;

  if (rows.length === 0) score -= 40;
  else if (rows.length < 5) score -= 10;

  if (sqlPath === 'groq_maverick') score -= 10;

  if (relevantColumns.length > 0) {
    const avgNullPct =
      relevantColumns.reduce((s, c) => s + (c.nullPct ?? 0), 0) / relevantColumns.length;
    if (avgNullPct > 20) score -= 15;
    if (avgNullPct > 50) score -= 15;
  }

  return Math.max(0, Math.min(100, score));
}
