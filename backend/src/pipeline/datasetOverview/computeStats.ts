import type pg from 'pg';
import type { ColumnProfile } from '../../semantic/profiler.js';

/** Safe dynamic table name (matches datasets route). */
export function isSafeDatasetTableName(name: string): boolean {
  return /^dataset_[a-zA-Z0-9_]+$/.test(name);
}

function quotedIdent(name: string): string {
  if (name.includes('"')) throw new Error('Invalid column name');
  return `"${name}"`;
}

const MAX_COLUMNS_DEEP = 32;
const TOP_K = 10;
const HIST_BINS = 8;

export type TopValueBin = { value: string; count: number };

export type NumericColumnStats = {
  min: number;
  max: number;
  mean: number | null;
  nonNullCount: number;
  histogram: { binIndex: number; count: number; lo: number; hi: number }[];
};

export type DateColumnStats = {
  min: string;
  max: string;
  nonNullCount: number;
};

export type ColumnStatEntry = {
  columnName: string;
  semanticType: string;
  postgresType: string;
  nullPct: number;
  uniqueCount: number;
  numeric?: NumericColumnStats;
  date?: DateColumnStats;
  topValues?: TopValueBin[];
};

export type DatasetStats = {
  tableName: string;
  rowCount: number;
  columns: ColumnStatEntry[];
};

async function runReadOnly<T extends pg.QueryResultRow>(
  pool: pg.Pool,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE readonly_agent');
    const result = await client.query<T>(sql, params);
    await client.query('ROLLBACK');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Deterministic aggregates for overview. Caps deep analysis to MAX_COLUMNS_DEEP columns.
 */
export async function computeDatasetStats(
  pool: pg.Pool,
  tableName: string,
  profiles: ColumnProfile[],
): Promise<DatasetStats> {
  if (!isSafeDatasetTableName(tableName)) {
    throw new Error('Invalid table name for stats');
  }
  const qt = quotedIdent(tableName);

  const countRows = await runReadOnly<{ c: string }>(
    pool,
    `SELECT COUNT(*)::text AS c FROM ${qt}`,
  );
  const rowCount = Math.max(0, parseInt(countRows[0]?.c ?? '0', 10) || 0);

  const columns: ColumnStatEntry[] = [];

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i]!;
    if (i >= MAX_COLUMNS_DEEP) {
      columns.push({
        columnName: p.columnName,
        semanticType: p.semanticType,
        postgresType: p.postgresType,
        nullPct: p.nullPct,
        uniqueCount: p.uniqueCount,
      });
      continue;
    }

    const qc = quotedIdent(p.columnName);
    const nullPct = p.nullPct;
    const uniqueCount = p.uniqueCount;

    if (p.postgresType === 'NUMERIC') {
      const agg = await runReadOnly<{ mn: string | null; mx: string | null; av: string | null; nn: string }>(
        pool,
        `SELECT
           MIN(${qc}::numeric)::text AS mn,
           MAX(${qc}::numeric)::text AS mx,
           AVG(${qc}::numeric)::text AS av,
           COUNT(${qc})::text AS nn
         FROM ${qt}`,
      );
      const a0 = agg[0];
      let numeric: NumericColumnStats | undefined;
      if (a0?.mn != null && a0?.mx != null) {
        const mn = parseFloat(a0.mn);
        const mx = parseFloat(a0.mx);
        const mean = a0.av != null ? parseFloat(a0.av) : null;
        const nn = parseInt(a0.nn ?? '0', 10);
        const histRows =
          mn === mx
            ? []
            : await runReadOnly<{ bin: string; ct: string }>(
                pool,
                `SELECT width_bucket(${qc}::numeric, $1::numeric, $2::numeric, $3)::text AS bin,
                        COUNT(*)::text AS ct
                 FROM ${qt}
                 WHERE ${qc} IS NOT NULL
                 GROUP BY 1
                 ORDER BY 1`,
                [mn, mx, HIST_BINS],
              );
        const span = mx - mn;
        const histogram = histRows.map((r) => {
          const binIndex = parseInt(r.bin ?? '0', 10);
          const count = parseInt(r.ct ?? '0', 10);
          const lo = span === 0 ? mn : mn + (span * (binIndex - 1)) / HIST_BINS;
          const hi = span === 0 ? mx : mn + (span * binIndex) / HIST_BINS;
          return { binIndex, count, lo, hi };
        });
        numeric = {
          min: mn,
          max: mx,
          mean: mean !== null && !Number.isNaN(mean) ? mean : null,
          nonNullCount: nn,
          histogram,
        };
      }
      columns.push({
        columnName: p.columnName,
        semanticType: p.semanticType,
        postgresType: p.postgresType,
        nullPct,
        uniqueCount,
        numeric,
      });
      continue;
    }

    if (p.postgresType === 'DATE') {
      const dr = await runReadOnly<{ mn: string | null; mx: string | null; nn: string }>(
        pool,
        `SELECT
           MIN(${qc})::text AS mn,
           MAX(${qc})::text AS mx,
           COUNT(${qc})::text AS nn
         FROM ${qt}`,
      );
      const d0 = dr[0];
      let date: DateColumnStats | undefined;
      if (d0?.mn != null && d0?.mx != null) {
        date = {
          min: d0.mn,
          max: d0.mx,
          nonNullCount: parseInt(d0.nn ?? '0', 10),
        };
      }
      columns.push({
        columnName: p.columnName,
        semanticType: p.semanticType,
        postgresType: p.postgresType,
        nullPct,
        uniqueCount,
        date,
      });
      continue;
    }

    // TEXT / category-style
    const top = await runReadOnly<{ v: string | null; ct: string }>(
      pool,
      `SELECT ${qc}::text AS v, COUNT(*)::text AS ct
       FROM ${qt}
       WHERE ${qc} IS NOT NULL AND TRIM(${qc}::text) <> ''
       GROUP BY ${qc}
       ORDER BY COUNT(*) DESC
       LIMIT ${TOP_K}`,
    );
    const topValues: TopValueBin[] = top
      .map((r) => ({
        value: r.v ?? '',
        count: parseInt(r.ct ?? '0', 10),
      }))
      .filter((x) => x.value.length > 0);

    columns.push({
      columnName: p.columnName,
      semanticType: p.semanticType,
      postgresType: p.postgresType,
      nullPct,
      uniqueCount,
      topValues: topValues.length > 0 ? topValues : undefined,
    });
  }

  return { tableName, rowCount, columns };
}
