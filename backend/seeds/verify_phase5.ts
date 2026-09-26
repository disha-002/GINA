/**
 * Phase 5 verification — 6 gates (Person A telemetry + Person B caches).
 * Run with: node --env-file=D:\Anoushka\Gina_cfp\backend\.env
 *           node_modules\tsx\dist\cli.mjs seeds/verify_phase5.ts <jwt>
 */

import pg from 'pg';
import { env } from '../src/config/env.js';
import { responseCacheKey } from '../src/cache/responseCache.js';

const BASE = 'http://localhost:3001';
const JWT =
  process.argv[2] ??
  (() => {
    throw new Error('Usage: verify_phase5.ts <jwt>');
  })();

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const TEST_QUESTION = 'What was my total spending?';

// ─── helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string, info = '') {
  passed++;
  console.log(`  ✅  [PASS] ${label}${info ? ' — ' + info : ''}`);
}
function fail(label: string, reason: string) {
  failed++;
  console.error(`  ❌  [FAIL] ${label} — ${reason}`);
}
async function check(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    fail(label, String(e));
  }
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' };
}

function sseHeaders(): Record<string, string> {
  return { ...authHeaders(), Accept: 'text/event-stream' };
}

async function apiGet(path: string) {
  return fetch(`${BASE}${path}`, { headers: authHeaders() });
}

async function apiPost(path: string, body: unknown) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
}

async function collectSse(
  path: string,
  body: unknown,
): Promise<{ event: string; data: unknown }[]> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: sseHeaders(),
    body: JSON.stringify(body),
    // @ts-expect-error - Node 22 fetch
    duplex: 'half',
  });

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const events: { event: string; data: unknown }[] = [];
  let buffer = '';
  let currentEvent = 'message';
  const decoder = new TextDecoder();
  const reader = res.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        const raw = line.slice('data:'.length).trim();
        try {
          events.push({ event: currentEvent, data: JSON.parse(raw) });
        } catch {
          events.push({ event: currentEvent, data: raw });
        }
        currentEvent = 'message';
      }
    }
  }
  return events;
}

// ─── setup: find sunita dataset + fresh conversation ─────────────────────────

let sunitaDatasetId = '';
let conversationId = '';
let conversationId2 = '';

async function setup() {
  await apiPost('/api/users/sync', {});
  const dsRes = await apiGet('/api/datasets');
  const dsJson = (await dsRes.json()) as { datasets: Array<{ id: string; demoSlug?: string; demo_slug?: string }> };
  const sunita = dsJson.datasets.find(
    (d) => d.demoSlug === 'sunita' || d.demo_slug === 'sunita',
  );
  if (!sunita) throw new Error(`Sunita dataset not found. Got: ${JSON.stringify(dsJson.datasets.map(d => ({ id: d.id, slug: d.demoSlug ?? d.demo_slug })))}`);
  sunitaDatasetId = sunita.id;

  // Ensure Gate 1 always starts from a cache miss for this dataset/question pair.
  const initialCacheKey = responseCacheKey(sunitaDatasetId, TEST_QUESTION);
  await pool.query(`DELETE FROM response_cache WHERE cache_key = $1`, [initialCacheKey]);

  const c1 = await apiPost(`/api/datasets/${sunitaDatasetId}/conversations`, {});
  const j1 = (await c1.json()) as { id?: string; conversation?: { id: string } };
  conversationId = j1.id ?? j1.conversation?.id ?? '';
  if (!conversationId) throw new Error(`No conversationId: ${JSON.stringify(j1)}`);

  const c2 = await apiPost(`/api/datasets/${sunitaDatasetId}/conversations`, {});
  const j2 = (await c2.json()) as { id?: string; conversation?: { id: string } };
  conversationId2 = j2.id ?? j2.conversation?.id ?? '';
  if (!conversationId2) throw new Error(`No conversationId2: ${JSON.stringify(j2)}`);
}

// ─── Gates ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n========== Phase 5 Verification (6 gates) ==========\n');

  try {
    await setup();
    console.log(`  Dataset  : ${sunitaDatasetId}`);
    console.log(`  Conv 1   : ${conversationId}`);
    console.log(`  Conv 2   : ${conversationId2}\n`);
  } catch (e) {
    console.error('  Setup failed:', e);
    await pool.end();
    process.exit(1);
  }

  const question = TEST_QUESTION;

  // ── Gate 1: First query → cacheHit=false, pipeline_runs row created ──────
  await check('Gate 1 — first query writes pipeline_runs row, cacheHit: false', async () => {
    const countBefore = (
      await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM pipeline_runs WHERE conversation_id = $1`,
        [conversationId],
      )
    ).rows[0]!.c;

    const events = await collectSse('/api/query', {
      conversationId,
      datasetId: sunitaDatasetId,
      question,
      sessionContext: { recentExchanges: [], lastResultSet: null },
    });

    const resultEvent = events.find((e) => e.event === 'result');
    if (!resultEvent) throw new Error(`No result event. Events: ${events.map(e => e.event).join(', ')}`);

    const payload = resultEvent.data as { cacheHit?: boolean };
    if (payload.cacheHit !== false) throw new Error(`Expected cacheHit: false, got: ${payload.cacheHit}`);

    // Wait briefly for async DB write
    await new Promise((r) => setTimeout(r, 500));

    const countAfter = (
      await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM pipeline_runs WHERE conversation_id = $1`,
        [conversationId],
      )
    ).rows[0]!.c;

    if (Number(countAfter) <= Number(countBefore)) {
      throw new Error(`pipeline_runs count did not increase: before=${countBefore} after=${countAfter}`);
    }
    ok('Gate 1', `pipeline_runs rows = ${countAfter}, cacheHit=false`);
  });

  // ── Gate 2: pipeline_runs row has intent + sql_path + latency populated ──
  await check('Gate 2 — pipeline_runs row has intent, sql_path, latency_total_ms', async () => {
    await new Promise((r) => setTimeout(r, 300));
    const { rows } = await pool.query<{
      intent: string;
      sql_path: string | null;
      latency_total_ms: number;
      rows_returned: number;
      confidence_score: number;
    }>(
      `SELECT intent, sql_path, latency_total_ms, rows_returned, confidence_score
       FROM pipeline_runs
       WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [conversationId],
    );
    if (rows.length === 0) throw new Error('No pipeline_runs row found');
    const row = rows[0]!;
    if (!row.intent) throw new Error(`intent is null`);
    if (row.latency_total_ms == null || row.latency_total_ms <= 0) {
      throw new Error(`latency_total_ms invalid: ${row.latency_total_ms}`);
    }
    if (row.rows_returned == null) throw new Error('rows_returned is null');
    ok('Gate 2', `intent=${row.intent} sql_path=${row.sql_path} latency=${row.latency_total_ms}ms rows=${row.rows_returned} conf=${row.confidence_score}`);
  });

  // ── Gate 3: Second identical query → response_cache hit ──────────────────
  let cacheHitMessageId = '';
  await check('Gate 3 — repeat query returns cacheHit: true with cache_hit SSE step', async () => {
    const events = await collectSse('/api/query', {
      conversationId: conversationId2,
      datasetId: sunitaDatasetId,
      question,
      sessionContext: { recentExchanges: [], lastResultSet: null },
    });

    const cacheHitStep = events.find(
      (e) => e.event === 'step' && (e.data as Record<string, unknown>).step === 'cache_hit',
    );
    if (!cacheHitStep) throw new Error(`No cache_hit step event. Events: ${events.map(e => e.event + ':' + JSON.stringify((e.data as Record<string,unknown>).step)).join(', ')}`);

    const resultEvent = events.find((e) => e.event === 'result');
    if (!resultEvent) throw new Error('No result event');

    const payload = resultEvent.data as { cacheHit?: boolean; messageId?: string };
    if (payload.cacheHit !== true) throw new Error(`Expected cacheHit: true, got: ${payload.cacheHit}`);
    cacheHitMessageId = payload.messageId ?? '';
    ok('Gate 3', `cacheHit=true, cache_hit step event present`);
  });

  // ── Gate 4: response_cache row exists with hit_count ≥ 1 ─────────────────
  await check('Gate 4 — response_cache row in DB with hit_count ≥ 1', async () => {
    const { rows } = await pool.query<{ hit_count: number; expires_at: string }>(
      `SELECT hit_count, expires_at FROM response_cache ORDER BY created_at DESC LIMIT 1`,
    );
    if (rows.length === 0) throw new Error('No response_cache row found');
    const row = rows[0]!;
    if (row.hit_count < 1) throw new Error(`hit_count = ${row.hit_count}, expected ≥ 1`);
    const expiresAt = new Date(row.expires_at);
    const now = new Date();
    const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilExpiry < 20 || hoursUntilExpiry > 25) {
      throw new Error(`expires_at not ~24h from now: ${hoursUntilExpiry.toFixed(1)}h`);
    }
    ok('Gate 4', `hit_count=${row.hit_count}, expires ~${hoursUntilExpiry.toFixed(0)}h from now`);
  });

  // ── Gate 5: cache hit pipeline_run row has cache_hit='response_cache' ─────
  await check('Gate 5 — pipeline_runs row for cache-hit query has cache_hit=response_cache', async () => {
    await new Promise((r) => setTimeout(r, 500));
    const { rows } = await pool.query<{ cache_hit: string; latency_total_ms: number }>(
      `SELECT cache_hit, latency_total_ms
       FROM pipeline_runs
       WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [conversationId2],
    );
    if (rows.length === 0) throw new Error('No pipeline_runs row for conv2');
    const row = rows[0]!;
    if (row.cache_hit !== 'response_cache') {
      throw new Error(`cache_hit = '${row.cache_hit}', expected 'response_cache'`);
    }
    ok('Gate 5', `cache_hit=${row.cache_hit}, latency=${row.latency_total_ms}ms`);
  });

  // ── Gate 6: narration_cache row exists after first query ──────────────────
  await check('Gate 6 — narration_cache row exists in DB', async () => {
    const { rows } = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM narration_cache`,
    );
    const count = Number(rows[0]?.c ?? 0);
    if (count === 0) throw new Error('narration_cache is empty');
    ok('Gate 6', `${count} narration_cache row(s)`);
  });

  // ── Gate 7: expired response cache is not served ──────────────────────────
  await check('Gate 7 — expired cache is not served (cache miss after manual expiry)', async () => {
    // Expire the cache entry
    await pool.query(
      `UPDATE response_cache SET expires_at = NOW() - INTERVAL '1 hour'`,
    );

    const c3Res = await apiPost(`/api/datasets/${sunitaDatasetId}/conversations`, {});
    const c3Json = (await c3Res.json()) as { id?: string };
    const convId3 = c3Json.id ?? '';
    if (!convId3) throw new Error('Failed to create conv3');

    const events = await collectSse('/api/query', {
      conversationId: convId3,
      datasetId: sunitaDatasetId,
      question,
      sessionContext: { recentExchanges: [], lastResultSet: null },
    });

    const cacheHitStep = events.find(
      (e) => e.event === 'step' && (e.data as Record<string, unknown>).step === 'cache_hit',
    );
    if (cacheHitStep) throw new Error('Got cache_hit step — expired cache was served');

    const resultEvent = events.find((e) => e.event === 'result');
    if (!resultEvent) throw new Error('No result event after cache expiry');

    const payload = resultEvent.data as { cacheHit?: boolean };
    if (payload.cacheHit !== false) throw new Error(`Expected cacheHit: false after expiry, got: ${payload.cacheHit}`);
    ok('Gate 7', 'expired cache skipped → fresh pipeline run');
  });

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Phase 5 result:  ${passed} passed / ${failed} failed`);
  console.log('══════════════════════════════════════════════════\n');

  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  pool.end();
  process.exit(1);
});
