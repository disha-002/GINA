import type { QueryResultTable } from '../types/queryResultPayload.js';
import type { ColumnProfile } from '../semantic/profiler.js';
import type { ResultRow } from './dbExecutor.js';

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Build a table view from readonly_agent rows + schema labels.
 * Empty result sets still get column headers from `relevantColumns` or full schema.
 */
export function buildResultTable(
  rows: ResultRow[],
  schemaColumns: ColumnProfile[],
  relevantColumns: string[],
): QueryResultTable {
  const labelByKey = new Map(
    schemaColumns.map((c) => [c.columnName, c.businessLabel || c.columnName] as const),
  );

  let keys: string[];
  if (rows.length > 0) {
    keys = Object.keys(rows[0]!);
  } else if (relevantColumns.length > 0) {
    keys = relevantColumns.filter((k) => schemaColumns.some((c) => c.columnName === k));
    if (keys.length === 0) keys = [...relevantColumns];
  } else {
    keys = schemaColumns.map((c) => c.columnName);
  }

  const columns = keys.map((key) => ({
    key,
    label: labelByKey.get(key) ?? key,
  }));

  const outRows = rows.map((row) => {
    const o: Record<string, string> = {};
    for (const key of keys) {
      o[key] = formatCell(row[key]);
    }
    return o;
  });

  return { columns, rows: outRows };
}
