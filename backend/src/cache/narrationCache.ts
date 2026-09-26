import { createHash } from 'crypto';
import type { Pool } from 'pg';

/**
 * Stable fingerprint for result shape: row count, sorted column names, SQL text.
 * (Backend plan: SHA256(result_shape_fingerprint + intent).)
 */
export function resultShapeFingerprint(
  rows: Record<string, unknown>[],
  sql: string,
): string {
  const cols = rows[0] ? Object.keys(rows[0]).sort().join('|') : '';
  return `${rows.length}::${cols}::${sql}`;
}

export function narrationCacheKey(intent: string, fingerprint: string): string {
  return createHash('sha256').update(`${fingerprint}::${intent}`, 'utf8').digest('hex');
}

export async function getNarrationCache(pool: Pool, cacheKey: string): Promise<string | null> {
  const { rows } = await pool.query<{ narration: string }>(
    `SELECT narration FROM narration_cache
     WHERE cache_key = $1 AND expires_at > NOW()`,
    [cacheKey],
  );
  if (rows.length === 0) return null;
  return rows[0]!.narration;
}

export async function storeNarrationCache(
  pool: Pool,
  cacheKey: string,
  narration: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO narration_cache (cache_key, narration, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')
     ON CONFLICT (cache_key) DO UPDATE SET
       narration = EXCLUDED.narration,
       expires_at = EXCLUDED.expires_at`,
    [cacheKey, narration],
  );
}
