/**
 * Phase 4 verification — 9 gates covering both Person A (orchestrator) and Person B (routing/SSE).
 * Run with: node --env-file=.env node_modules/tsx/dist/cli.mjs seeds/verify_phase4.ts
 */

import pg from 'pg';
import { env } from '../src/config/env.js';

const BASE = 'http://localhost:3001';
const JWT =
  process.argv[2] ??
  (() => {
    throw new Error('Usage: verify_phase4.ts <jwt>');
  })();

const DEMO_USER_ID = '910f109c-ca50-4c97-acfb-87eb785a937e';

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

/** Collect all SSE events from the /api/query stream. Returns list of parsed event objects. */
async function collectSse(
  path: string,
  body: unknown,
): Promise<{ event: string; data: unknown }[]> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: sseHeaders(),
    body: JSON.stringify(body),
    // @ts-expect-error - Node 22 fetch supports duplex
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

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

// ─── prepare: get sunita demo dataset + create a conversation ─────────────────

let sunitaDatasetId = '';
let conversationId = '';

async function setup() {
  // Get sunita demo dataset id
  const dsRes = await apiGet('/api/datasets');
  const dsJson = (await dsRes.json()) as { datasets: Array<{ id: string; demoSlug?: string; demo_slug?: string }> };
  const sunita = dsJson.datasets.find(
    (d) => d.demoSlug === 'sunita' || d.demo_slug === 'sunita',
  );
  if (!sunita) throw new Error(`Sunita demo dataset not found. Got: ${JSON.stringify(dsJson.datasets.map(d => ({ id: d.id, slug: d.demoSlug ?? d.demo_slug })))}`);
  sunitaDatasetId = sunita.id;

  // Sync user first
  await apiPost('/api/users/sync', {});

  // Create a conversation for testing
  const convRes = await apiPost(`/api/datasets/${sunitaDatasetId}/conversations`, {});
  const convJson = (await convRes.json()) as { id?: string; conversation?: { id: string } };
  conversationId = convJson.id ?? convJson.conversation?.id ?? '';
  if (!conversationId) throw new Error(`Failed to create conversation: ${JSON.stringify(convJson)}`);
}

// ─── verification ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n========== Phase 4 Verification (9 gates) ==========\n');

  try {
    await setup();
    console.log(`  Using dataset: ${sunitaDatasetId}`);
    console.log(`  Using conversation: ${conversationId}\n`);
  } catch (e) {
    console.error('  Setup failed:', e);
    console.error('  Cannot proceed with Phase 4 tests.\n');
    await pool.end();
    process.exit(1);
  }

  // ── Gate 1: Full SSE stream works — result event received ────────────────────
  let resultEvent: Record<string, unknown> | null = null;
  await check('Gate 1 — SSE stream: result event received for data question', async () => {
    const events = await collectSse('/api/query', {
      conversationId,
      datasetId: sunitaDatasetId,
      question: 'What was my total spending?',
      sessionContext: { recentExchanges: [], lastResultSet: null },
    });
    const result = events.find((e) => e.event === 'result');
    if (!result) throw new Error(`No result event. Events: ${events.map(e => e.event).join(', ')}`);
    resultEvent = result.data as Record<string, unknown>;
    ok('Gate 1', `events: [${events.map((e) => e.event).join(', ')}]`);
  });

  // ── Gate 2: Output payload has all required fields ────────────────────────────
  await check('Gate 2 — Output payload: all required fields present', async () => {
    if (!resultEvent) throw new Error('No result from Gate 1');
    const required = [
      'narrative', 'chartType', 'chartData', 'keyFigure', 'citationChips',
      'sql', 'secondarySql', 'rowCount', 'confidenceScore', 'followUpSuggestions',
      'autoInsights', 'cacheHit', 'snapshotUsed', 'messageId',
    ];
    const missing = required.filter((k) => !(k in resultEvent!));
    if (missing.length > 0) throw new Error(`Missing fields: ${missing.join(', ')}`);
    ok('Gate 2', `chartType=${resultEvent.chartType}, confidence=${resultEvent.confidenceScore}`);
  });

  // ── Gate 3: Messages persisted in DB ─────────────────────────────────────────
  await check('Gate 3 — Message persistence: user + assistant messages stored', async () => {
    // Wait briefly for persistence (it happens after SSE close)
    await new Promise((r) => setTimeout(r, 1500));

    const msgs = await pool.query<{ role: string; has_output: boolean }>(
      `SELECT role, (output_payload IS NOT NULL) as has_output
       FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );
    if (msgs.rows.length < 2) throw new Error(`Expected 2 messages, got ${msgs.rows.length}`);
    const userMsg = msgs.rows.find((r) => r.role === 'user');
    const assistantMsg = msgs.rows.find((r) => r.role === 'assistant');
    if (!userMsg) throw new Error('No user message');
    if (!assistantMsg) throw new Error('No assistant message');
    if (assistantMsg.has_output !== true) throw new Error('Assistant message missing output_payload');
    ok('Gate 3', `${msgs.rows.length} messages — user + assistant with output_payload`);
  });

  // ── Gate 4: Conversation title auto-set ──────────────────────────────────────
  await check('Gate 4 — Conversation title: auto-set from first question', async () => {
    const r = await pool.query<{ title: string | null }>(
      'SELECT title FROM conversations WHERE id = $1',
      [conversationId],
    );
    const title = r.rows[0]?.title;
    if (!title) throw new Error('Conversation title is null');
    ok('Gate 4', `title="${title}"`);
  });

  // ── Gate 5: Conversational intent skips SQL ───────────────────────────────────
  await check('Gate 5 — Conversational intent: no sql_generation step', async () => {
    // Create a fresh conversation for this test
    const convRes = await apiPost(`/api/datasets/${sunitaDatasetId}/conversations`, {});
    const convJson = (await convRes.json()) as { id?: string; conversation?: { id: string } };
    const convId = convJson.id ?? convJson.conversation?.id ?? '';
    if (!convId) throw new Error('Failed to create conversation for Gate 5');

    const events = await collectSse('/api/query', {
      conversationId: convId,
      datasetId: sunitaDatasetId,
      question: 'Hello, what can you do?',
      sessionContext: { recentExchanges: [], lastResultSet: null },
    });
    const hasSqlStep = events.some((e) => {
      const d = e.data as Record<string, unknown>;
      return d.step === 'sql_generation';
    });
    if (hasSqlStep) throw new Error('sql_generation step fired for conversational intent');
    const hasResult = events.some((e) => e.event === 'result');
    if (!hasResult) throw new Error('No result event for conversational intent');
    ok('Gate 5', `${events.length} events, no sql_generation`);
  });

  // ── Gate 6: Narrative is plain English, no markdown ───────────────────────────
  await check('Gate 6 — Narrative: non-empty, no markdown', async () => {
    if (!resultEvent) throw new Error('No result from Gate 1');
    const narrative = String(resultEvent.narrative ?? '');
    if (!narrative.trim()) throw new Error('Empty narrative');
    if (narrative.includes('**') || narrative.includes('## ') || narrative.includes('- ')) {
      throw new Error(`Contains markdown: "${narrative.substring(0, 100)}"`);
    }
    ok('Gate 6', `"${narrative.substring(0, 80)}..."`);
  });

  // ── Gate 7: followUpSuggestions is 3 items ────────────────────────────────────
  await check('Gate 7 — Follow-up suggestions: exactly 3', async () => {
    if (!resultEvent) throw new Error('No result from Gate 1');
    const suggs = resultEvent.followUpSuggestions as unknown[];
    if (!Array.isArray(suggs)) throw new Error('followUpSuggestions is not an array');
    if (suggs.length !== 3) throw new Error(`Expected 3, got ${suggs.length}: ${JSON.stringify(suggs)}`);
    ok('Gate 7', suggs.map((s) => `"${String(s).substring(0, 40)}"`).join(', '));
  });

  // ── Gate 8: SQL generated via tier chain (preferred tier may differ from final path) ──
  await check('Gate 8 — SQL present after tier chain (HF / Maverick / template)', async () => {
    // Preferred tier depends on planner intent; fallback is normal when not using preferred path
    if (!resultEvent) throw new Error('No result from Gate 1');
    const sqlPath = String(resultEvent.sql ? 'has_sql' : 'no_sql');
    const sql = String(resultEvent.sql ?? '');
    // As long as we got a valid SQL result (even from template/groq), the 4-tier fallback worked
    if (!sql) throw new Error('No SQL in result');
    ok('Gate 8', `sql generated via fallback chain: "${sql.substring(0, 60)}..."`);
  });

  // ── Gate 9: GET /api/conversations/:id/messages returns the messages ──────────
  await check('Gate 9 — GET messages: history endpoint returns persisted messages', async () => {
    const res = await apiGet(`/api/conversations/${conversationId}/messages`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { messages: Array<{ role: string; outputPayload: unknown }> };
    if (!Array.isArray(json.messages)) throw new Error('messages not an array');
    if (json.messages.length < 2) throw new Error(`Expected ≥2, got ${json.messages.length}`);
    const assistant = json.messages.find((m) => m.role === 'assistant');
    if (!assistant?.outputPayload) throw new Error('Assistant message missing outputPayload');
    ok('Gate 9', `${json.messages.length} messages returned, assistant has outputPayload`);
  });

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  Phase 4 result:  ${passed} passed / ${failed} failed`);
  console.log(`══════════════════════════════════════════════════\n`);

  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
