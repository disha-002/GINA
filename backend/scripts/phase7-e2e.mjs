#!/usr/bin/env node
/**
 * Phase 7 — A+B integration verification (requires running API + DATABASE_URL + real JWT).
 *
 *   cd backend && set -a && source .env && set +a
 *   export TEST_JWT="$(node --import tsx seeds/get_test_jwt.ts 2>/dev/null | tail -1)"  # or paste token
 *   node scripts/phase7-e2e.mjs
 *
 * Env:
 *   BASE_URL (default http://127.0.0.1:3001)
 *   TEST_JWT — Bearer token (required)
 *   STRESS_HEALTH_ROUNDS — default 35 (rapid GET /health)
 *   RUN_SSE_QUERY — set to 1 to POST /api/query once (slow; hits LLM pipeline)
 */

import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001';
const token = process.env.TEST_JWT;
const stressRounds = Number(process.env.STRESS_HEALTH_ROUNDS ?? '35');
const runSse = process.env.RUN_SSE_QUERY === '1';

const authHeaders = { Authorization: token ? `Bearer ${token}` : '' };
const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

async function main() {
  if (!token) fail('Set TEST_JWT to a Supabase access token');

  // 1) Health (no auth)
  const h = await fetch(`${BASE}/health`);
  if (!h.ok) fail(`/health ${h.status}`);
  const hj = await h.json();
  if (hj.status !== 'ok') fail('health body');

  // 2) Users sync
  const sync = await fetch(`${BASE}/api/users/sync`, {
    method: 'POST',
    headers: jsonHeaders,
    body: '{}',
  });
  if (!sync.ok) fail(`/api/users/sync ${sync.status} ${await sync.text()}`);

  // 3) Datasets
  const dsRes = await fetch(`${BASE}/api/datasets`, { headers: authHeaders });
  if (!dsRes.ok) fail(`/api/datasets ${dsRes.status}`);
  const dsJson = await dsRes.json();
  const datasets = dsJson.datasets ?? [];
  if (!Array.isArray(datasets) || datasets.length === 0) fail('no datasets (seed demos?)');

  const demo =
    datasets.find((d) => d.demoSlug === 'sunita' || d.demo_slug === 'sunita') ?? datasets[0];
  const datasetId = demo.id;

  // 4) Semantic (demo readable for any logged-in user after Phase 7 fix)
  const sem = await fetch(`${BASE}/api/datasets/${datasetId}/semantic`, { headers: authHeaders });
  if (!sem.ok) fail(`/api/datasets/:id/semantic ${sem.status} ${await sem.text()}`);

  // 5) Another user's / missing dataset → 404
  const bogus = await fetch(`${BASE}/api/datasets/${randomUUID()}/semantic`, { headers: authHeaders });
  if (bogus.status !== 404) fail(`expected 404 for random dataset, got ${bogus.status}`);

  // 6) Conversations list
  const convList = await fetch(`${BASE}/api/datasets/${datasetId}/conversations`, { headers: authHeaders });
  if (!convList.ok) fail(`conversations list ${convList.status}`);

  // 7) Create conversation
  const convCreate = await fetch(`${BASE}/api/datasets/${datasetId}/conversations`, {
    method: 'POST',
    headers: jsonHeaders,
    body: '{}',
  });
  if (!convCreate.ok) fail(`create conversation ${convCreate.status}`);
  const conv = await convCreate.json();
  const conversationId = conv.id;

  // 8) Messages (empty)
  const msgRes = await fetch(`${BASE}/api/conversations/${conversationId}/messages`, { headers: authHeaders });
  if (!msgRes.ok) fail(`messages ${msgRes.status}`);

  // 9) Snapshot toggle x2
  const t1 = await fetch(`${BASE}/api/snapshot/toggle`, { method: 'POST', headers: jsonHeaders, body: '{}' });
  if (!t1.ok) fail(`snapshot toggle ${t1.status}`);
  const t1j = await t1.json();
  if (typeof t1j.snapshotMode !== 'boolean') fail('snapshot toggle body');
  const t2 = await fetch(`${BASE}/api/snapshot/toggle`, { method: 'POST', headers: jsonHeaders, body: '{}' });
  if (!t2.ok) fail(`snapshot toggle 2 ${t2.status}`);

  // 10) Rapid health checks (connection / CORS sanity — no Groq)
  const stress = [];
  for (let i = 0; i < stressRounds; i++) {
    stress.push(fetch(`${BASE}/health`));
  }
  const stressRes = await Promise.all(stress);
  const bad = stressRes.filter((r) => !r.ok);
  if (bad.length) fail(`stress health: ${bad.length} non-ok responses`);

  // 11) Optional SSE query (full pipeline)
  if (runSse) {
    const body = JSON.stringify({
      conversationId,
      datasetId,
      question: 'Hello, what can you do?',
      sessionContext: { recentExchanges: [], lastResultSet: null },
    });
    const qRes = await fetch(`${BASE}/api/query`, {
      method: 'POST',
      headers: { ...jsonHeaders, Accept: 'text/event-stream' },
      body,
    });
    if (!qRes.ok) fail(`/api/query ${qRes.status} ${await qRes.text()}`);
    const text = await qRes.text();
    if (!text.includes('event:') && !text.includes('result')) {
      console.warn('WARN: SSE body unexpected — check stream format');
    }
    const msg2 = await fetch(`${BASE}/api/conversations/${conversationId}/messages`, { headers: authHeaders });
    if (!msg2.ok) fail(`messages after query ${msg2.status}`);
    const hist = await msg2.json();
    const n = hist.messages?.length ?? 0;
    if (n < 2) fail(`expected at least 2 messages after query, got ${n}`);
  }

  console.log('OK — Phase 7 smoke passed.');
  console.log(`    datasets=${datasets.length} demoDataset=${datasetId} conversations=${conversationId}`);
  console.log(`    stress_health=${stressRounds} ok`);
  if (!runSse) console.log('    (Set RUN_SSE_QUERY=1 to exercise POST /api/query + messages)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
