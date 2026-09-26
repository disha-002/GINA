import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export type ResultRow = Record<string, unknown>;

export type DbExecutorResult = {
  rows: ResultRow[];
  /** How many rows the query actually returned (capped at MAX_ROWS). */
  rowCount: number;
  /** True if result was capped at MAX_ROWS. */
  truncated: boolean;
};

const MAX_ROWS = 100;

/**
 * Creates a one-time Pool that connects as the `readonly_agent` PostgreSQL role.
 * We can't SET ROLE after connecting via the standard pool (which uses the main role),
 * so we create a short-lived pool with `options=-c%20role%3Dreadonly_agent` added to
 * the connection string if the main URL does not already include role override.
 *
 * NOTE: If the Supabase pooler URL does not support SET ROLE (e.g. transaction mode),
 * we fall back to running `SET LOCAL ROLE readonly_agent` inside a single-use client
 * from the regular pool passed by the caller.
 */

/**
 * §6 Step 4 — Execute a read-only SQL query via the `readonly_agent` PostgreSQL role.
 *
 * @param pool    The main pg Pool (from fastify.db).
 * @param sql     A SELECT statement (pre-validated).
 * @param params  Bound parameters (rare — most SQL from generators uses inline literals;
 *                pass [] for none).
 */
export async function executeReadOnlySql(
  pool: pg.Pool,
  sql: string,
  params: unknown[] = [],
): Promise<DbExecutorResult> {
  const client = await pool.connect();
  try {
    // Impose readonly_agent role for this transaction.
    // Using a transaction lets us SET LOCAL ROLE which is auto-rolled back on release.
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE readonly_agent');

    // Wrap the query so the DB engine enforces the row cap even if the generated SQL lacks LIMIT.
    const cappedSql = wrapWithLimit(sql, MAX_ROWS + 1);

    const result = await client.query(cappedSql, params);

    await client.query('ROLLBACK'); // read-only — nothing to commit

    const raw = result.rows as ResultRow[];
    const truncated = raw.length > MAX_ROWS;
    return {
      rows: truncated ? raw.slice(0, MAX_ROWS) : raw,
      rowCount: truncated ? MAX_ROWS : raw.length,
      truncated,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Wrap a SELECT in a subquery that adds LIMIT if one is not already present,
 * so even template-generated SQL that lacks LIMIT gets capped server-side.
 */
function wrapWithLimit(sql: string, limit: number): string {
  const upper = sql.replace(/\s+/g, ' ').toUpperCase();
  // If a top-level LIMIT is already present (and no LIMIT inside a subquery after the last FROM),
  // trust it; otherwise wrap.
  if (/\bLIMIT\s+\d+\s*$/.test(upper.trim())) {
    return sql;
  }
  return `SELECT * FROM (${sql}) AS _q LIMIT ${limit}`;
}
