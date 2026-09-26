#!/usr/bin/env node
/**
 * Full E2E: random CSV → POST /api/datasets/upload → semantic → conversation → 3× /api/query (SSE).
 *
 * Requires: running API, .env with DB/S3/Groq/HF, valid TEST_JWT.
 *
 *   cd backend && export TEST_JWT="$(node --import tsx seeds/get_test_jwt.ts 2>/dev/null | grep '^eyJ' | head -1)"
 *   node scripts/e2e-full-upload.mjs
 *
 * Env:
 *   BASE_URL (default http://127.0.0.1:3001)
 *   TEST_JWT (required)
 *   E2E_SKIP_UPLOAD=1 — skip CSV upload; use E2E_DATASET_ID or first sunita demo (query path only)
 */

import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001';
const token = process.env.TEST_JWT;
const skipUpload = process.env.E2E_SKIP_UPLOAD === '1';
const datasetIdEnv = process.env.E2E_DATASET_ID;

function fail(msg, detail) {
  console.error('FAIL:', msg);
  if (detail != null) console.error(detail);
  process.exit(1);
}

function randomAmount() {
  return (Math.random() * 450 + 10).toFixed(2);
}

function buildRandomCsv(rowCount = 24) {
  const cats = ['Office', 'Travel', 'Software', 'Meals'];
  const lines = ['date,category,amount'];
  const start = new Date('2024-01-01');
  for (let i = 0; i < rowCount; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 3 + Math.floor(Math.random() * 2));
    const iso = d.toISOString().slice(0, 10);
    const cat = cats[i % cats.length];
    lines.push(`${iso},${cat},${randomAmount()}`);
  }
  return lines.join('\n');
}

/** Parse @fastify/sse stream text for the last `event: result` JSON payload (@fastify/sse may split JSON across multiple `data:` lines). */
function extractLastResultPayload(sseText) {
  const idx = sseText.lastIndexOf('event: result');
  if (idx === -1) return null;
  const chunk = sseText.slice(idx);
  const block = chunk.match(/event:\s*result\r?\n([\s\S]*?)(?:\r?\n\r?\n|$)/);
  if (!block) return null;
  const dataLines = block[1].split(/\r?\n/).filter((l) => l.startsWith('data:'));
  const joined = dataLines.map((l) => l.replace(/^data:\s?/, '')).join('');
  try {
    const o = JSON.parse(joined);
    if (o && typeof o.narrative === 'string') return o;
  } catch {
    /* ignore */
  }
  return null;
}

async function postQuery(conversationId, datasetId, question, sessionContext) {
  const body = JSON.stringify({
    conversationId,
    datasetId,
    question,
    sessionContext,
  });
  const res = await fetch(`${BASE}/api/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    fail(`/api/query failed ${res.status}`, t);
  }
  return res.text();
}

async function main() {
  if (!token) fail('Set TEST_JWT');

  const h = await fetch(`${BASE}/health`);
  if (!h.ok) fail(`/health ${h.status}`);

  const sync = await fetch(`${BASE}/api/users/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!sync.ok) fail('users/sync', await sync.text());

  let datasetId;

  if (skipUpload) {
    if (datasetIdEnv) {
      datasetId = datasetIdEnv;
      console.log('E2E_SKIP_UPLOAD: using E2E_DATASET_ID=', datasetId);
    } else {
      const dsRes = await fetch(`${BASE}/api/datasets`, { headers: { Authorization: `Bearer ${token}` } });
      if (!dsRes.ok) fail('datasets list', await dsRes.text());
      const { datasets } = await dsRes.json();
      const sunita = datasets?.find((d) => d.demoSlug === 'sunita' || d.demo_slug === 'sunita');
      datasetId = sunita?.id ?? datasets?.[0]?.id;
      if (!datasetId) fail('no dataset for E2E_SKIP_UPLOAD');
      console.log('E2E_SKIP_UPLOAD: using demo dataset', datasetId);
    }
  } else {
    const csv = buildRandomCsv(22);
    const filename = `e2e_${Date.now()}_${randomUUID().slice(0, 8)}.csv`;
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), filename);

    console.log('Uploading CSV…', filename, `(${csv.split('\n').length - 1} data rows)`);
    const up = await fetch(`${BASE}/api/datasets/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!up.ok) {
      const body = await up.text();
      if (up.status === 502) {
        console.error(
          'Hint: upload needs Groq (enricher) + HuggingFace embeddings. Check GROQ_MODEL_* and API keys in .env.',
        );
      }
      fail(`upload ${up.status}`, body);
    }

    const uploaded = await up.json();
    datasetId = uploaded.dataset?.id;
    if (!datasetId) fail('upload response missing dataset.id', JSON.stringify(uploaded, null, 2));
    console.log('Dataset:', datasetId, 'rows:', uploaded.dataset?.rowCount);
  }

  const sem = await fetch(`${BASE}/api/datasets/${datasetId}/semantic`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!sem.ok) fail('semantic', await sem.text());

  const conv = await fetch(`${BASE}/api/datasets/${datasetId}/conversations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!conv.ok) fail('create conversation', await conv.text());
  const { id: conversationId } = await conv.json();

  const questions = [
    'Hello — what can you help me do with this dataset?',
    'What is the total amount?',
    'Which category has the highest total spend?',
  ];

  const recentExchanges = [];
  let lastResultSet = null;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`Query ${i + 1}/${questions.length}:`, q.slice(0, 60) + (q.length > 60 ? '…' : ''));
    const sseText = await postQuery(conversationId, datasetId, q, {
      recentExchanges,
      lastResultSet,
    });
    if (sseText.includes('event: error')) {
      const em = sseText.match(/event:\s*error[\s\S]*?data:\s*(\{[\s\S]*?\})\s*(?:\n\n|$)/);
      fail(
        'Pipeline emitted error (check GROQ_MODEL_* / API keys in .env)',
        em ? em[1] : sseText.slice(-500),
      );
    }
    const result = extractLastResultPayload(sseText);
    if (!result?.narrative) {
      console.error('SSE tail (400 chars):', sseText.slice(-400));
      fail('No result payload with narrative in SSE');
    }
    recentExchanges.push({ question: q, answer: result.narrative });
    if (Array.isArray(result.chartData?.datasets) || result.rowCount != null) {
      lastResultSet = [{ _note: 'opaque', rowCount: result.rowCount }];
    }
  }

  const msgRes = await fetch(`${BASE}/api/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!msgRes.ok) fail('messages', await msgRes.text());
  const { messages } = await msgRes.json();
  const n = messages?.length ?? 0;
  if (n < 6) fail(`expected ≥6 messages (3× user+assistant), got ${n}`);

  console.log('');
  console.log('OK — full upload + 3-query E2E passed.');
  console.log(`    datasetId=${datasetId}`);
  console.log(`    conversationId=${conversationId}`);
  console.log(`    messages=${n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
