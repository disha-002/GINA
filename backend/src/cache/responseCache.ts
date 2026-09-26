import { createHash } from 'crypto';
import type { Pool } from 'pg';
import type { QueryResultPayload } from '../types/queryResultPayload.js';

/** Normalise for stable cache keys (implementation plan: normalised_question). */
export function normaliseQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function responseCacheKey(datasetId: string, question: string): string {
  const n = normaliseQuestion(question);
  return createHash('sha256').update(`${n}::${datasetId}`, 'utf8').digest('hex');
}

function isPayload(x: unknown): x is QueryResultPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.narrative === 'string' &&
    typeof o.sql === 'string' &&
    typeof o.rowCount === 'number'
  );
}

/**
 * Lookup non-expired response cache. Does not increment hit_count — call `incrementResponseCacheHits` after you serve it.
 */
export async function getResponseCache(
  pool: Pool,
  datasetId: string,
  question: string,
): Promise<{ cacheKey: string; payload: QueryResultPayload } | null> {
  const cacheKey = responseCacheKey(datasetId, question);
  const { rows } = await pool.query<{ output_payload: unknown }>(
    `SELECT output_payload FROM response_cache
     WHERE cache_key = $1 AND expires_at > NOW()`,
    [cacheKey],
  );
  if (rows.length === 0) return null;
  const raw = rows[0]?.output_payload;
  if (!isPayload(raw)) return null;
  return { cacheKey, payload: raw };
}

export async function incrementResponseCacheHits(pool: Pool, cacheKey: string): Promise<void> {
  await pool.query(
    `UPDATE response_cache SET hit_count = hit_count + 1 WHERE cache_key = $1`,
    [cacheKey],
  );
}

/**
 * Upsert full result payload; 24h TTL from now.
 */
export async function storeResponseCache(
  pool: Pool,
  datasetId: string,
  question: string,
  payload: QueryResultPayload,
): Promise<void> {
  const cacheKey = responseCacheKey(datasetId, question);
  await pool.query(
    `INSERT INTO response_cache (cache_key, output_payload, expires_at)
     VALUES ($1, $2::jsonb, NOW() + INTERVAL '24 hours')
     ON CONFLICT (cache_key) DO UPDATE SET
       output_payload = EXCLUDED.output_payload,
       expires_at = EXCLUDED.expires_at`,
    [cacheKey, JSON.stringify(payload)],
  );
}
