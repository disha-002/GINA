/**
 * Phase 6 verification — snapshot mode (Person A + Person B).
 * Run with: node --env-file=D:\Anoushka\Gina_cfp\backend\.env
 *           node_modules\tsx\dist\cli.mjs seeds\verify_phase6.ts <jwt>
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../src/config/env.js';

type SnapshotFile = {
  matchQuestion: string;
  datasetSlug: string;
  outputPayload: {
    narrative: string;
  };
};

type SseEvent = {
  event: string;
  data: unknown;
  at: number;
};

const BASE = 'http://localhost:3001';
const JWT =
  process.argv[2] ??
  (() => {
    throw new Error('Usage: verify_phase6.ts <jwt>');
  })();

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

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

async function toggleSnapshotModeViaApi(): Promise<boolean> {
  const res = await apiPost('/api/snapshot/toggle', {});
  if (!res.ok) {
    throw new Error(`toggle failed HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { snapshotMode?: boolean };
  if (typeof json.snapshotMode !== 'boolean') {
    throw new Error(`toggle response missing snapshotMode: ${JSON.stringify(json)}`);
  }
  return json.snapshotMode;
}

async function createConversation(datasetId: string): Promise<string> {
  const res = await apiPost(`/api/datasets/${datasetId}/conversations`, {});
  if (!res.ok) {
    throw new Error(`create conversation failed HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { id?: string; conversation?: { id?: string } };
  const id = json.id ?? json.conversation?.id ?? '';
  if (!id) throw new Error(`missing conversation id: ${JSON.stringify(json)}`);
  return id;
}

async function collectSse(path: string, body: unknown): Promise<SseEvent[]> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: sseHeaders(),
    body: JSON.stringify(body),
    // @ts-expect-error - Node 22 fetch supports duplex for streaming bodies.
    duplex: 'half',
  });

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const events: SseEvent[] = [];
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
          events.push({ event: currentEvent, data: JSON.parse(raw), at: Date.now() });
        } catch {
          events.push({ event: currentEvent, data: raw, at: Date.now() });
        }
        currentEvent = 'message';
      }
    }
  }

  return events;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshotsDir = join(__dirname, '..', 'snapshots');

async function loadSnapshotFiles(): Promise<SnapshotFile[]> {
  const names = (await readdir(snapshotsDir)).filter((n) => n.endsWith('.json')).sort();
  const out: SnapshotFile[] = [];

  for (const name of names) {
    const txt = await readFile(join(snapshotsDir, name), 'utf8');
    const parsed = JSON.parse(txt) as SnapshotFile;
    out.push(parsed);
  }

  return out;
}

let datasetBySlug = new Map<string, string>();
let snapshots: SnapshotFile[] = [];
let snapshotConvForTelemetry = '';

async function setup() {
  await apiPost('/api/users/sync', {});

  const dsRes = await apiGet('/api/datasets');
  if (!dsRes.ok) {
    throw new Error(`GET /api/datasets failed HTTP ${dsRes.status}: ${await dsRes.text()}`);
  }
  const dsJson = (await dsRes.json()) as {
    datasets: Array<{ id: string; demoSlug?: string; demo_slug?: string }>;
  };

  datasetBySlug = new Map(
    dsJson.datasets
      .map((d) => ({ slug: d.demoSlug ?? d.demo_slug ?? '', id: d.id }))
      .filter((d) => d.slug !== '')
      .map((d) => [d.slug, d.id]),
  );

  for (const slug of ['sunita', 'james', 'donations']) {
    if (!datasetBySlug.has(slug)) {
      throw new Error(`Missing demo dataset slug '${slug}'`);
    }
  }

  snapshots = await loadSnapshotFiles();
  if (snapshots.length !== 6) {
    throw new Error(`Expected 6 snapshot files, got ${snapshots.length}`);
  }
}

async function forceSnapshotMode(targetOn: boolean): Promise<void> {
  const first = await toggleSnapshotModeViaApi();
  if (first === targetOn) return;
  const second = await toggleSnapshotModeViaApi();
  if (second !== targetOn) {
    throw new Error(`Could not force snapshotMode=${targetOn}; got ${second}`);
  }
}

async function main() {
  console.log('\n========== Phase 6 Verification (A + B) ==========\n');

  try {
    await setup();
    console.log(`  Snapshots loaded from disk: ${snapshots.length}`);
    console.log(`  Demo datasets found       : ${Array.from(datasetBySlug.keys()).join(', ')}\n`);
  } catch (e) {
    console.error('  Setup failed:', e);
    await pool.end();
    process.exit(1);
  }

  await check('Gate 1 — toggle snapshot mode ON', async () => {
    await forceSnapshotMode(true);
    ok('Gate 1', 'snapshotMode=true');
  });

  await check('Gate 2 — scripted snapshot returns exact narrative with snapshotUsed=true', async () => {
    const target = snapshots.find((s) => s.datasetSlug === 'sunita');
    if (!target) throw new Error('No sunita snapshot found');

    const datasetId = datasetBySlug.get(target.datasetSlug)!;
    const conversationId = await createConversation(datasetId);
    snapshotConvForTelemetry = conversationId;

    const events = await collectSse('/api/query', {
      conversationId,
      datasetId,
      question: target.matchQuestion,
      sessionContext: { recentExchanges: [], lastResultSet: null },
    });

    const resultEvent = events.find((e) => e.event === 'result');
    if (!resultEvent) throw new Error('No result event');

    const payload = resultEvent.data as { narrative?: string; snapshotUsed?: boolean };
    if (payload.snapshotUsed !== true) {
      throw new Error(`Expected snapshotUsed=true, got ${payload.snapshotUsed}`);
    }
    if (payload.narrative !== target.outputPayload.narrative) {
      throw new Error('Snapshot narrative mismatch');
    }

    ok('Gate 2', 'snapshotUsed=true and narrative matched JSON');
  });

  await check('Gate 3 — scripted snapshot streams step events with simulated delay', async () => {
    const target = snapshots.find((s) => s.datasetSlug === 'james');
    if (!target) throw new Error('No james snapshot found');

    const datasetId = datasetBySlug.get(target.datasetSlug)!;
    const conversationId = await createConversation(datasetId);

    const events = await collectSse('/api/query', {
      conversationId,
      datasetId,
      question: target.matchQuestion,
      sessionContext: { recentExchanges: [], lastResultSet: null },
    });

    const stepEvents = events.filter((e) => e.event === 'step');
    if (stepEvents.length < 4) {
      throw new Error(`Expected >=4 step events, got ${stepEvents.length}`);
    }

    const deltas: number[] = [];
    for (let i = 1; i < stepEvents.length; i++) {
      deltas.push(stepEvents[i]!.at - stepEvents[i - 1]!.at);
    }

    const spacedCount = deltas.filter((d) => d >= 120).length;
    if (spacedCount < 2) {
      throw new Error(`Step deltas too small for simulated stream: [${deltas.join(', ')}]`);
    }

    ok('Gate 3', `stepEvents=${stepEvents.length}, deltas=[${deltas.join(', ')}]ms`);
  });

  await check('Gate 4 — non-scripted question falls through to live pipeline (snapshotUsed=false)', async () => {
    const datasetId = datasetBySlug.get('sunita')!;
    const conversationId = await createConversation(datasetId);

    const events = await collectSse('/api/query', {
      conversationId,
      datasetId,
      question: 'What was my total spending overall?',
      sessionContext: { recentExchanges: [], lastResultSet: null },
    });

    const errorEvent = events.find((e) => e.event === 'error');
    if (errorEvent) {
      throw new Error(`Unexpected error event: ${JSON.stringify(errorEvent.data)}`);
    }

    const resultEvent = events.find((e) => e.event === 'result');
    if (!resultEvent) throw new Error('No result event');

    const payload = resultEvent.data as { snapshotUsed?: boolean };
    if (payload.snapshotUsed !== false) {
      throw new Error(`Expected snapshotUsed=false, got ${payload.snapshotUsed}`);
    }

    ok('Gate 4', 'non-scripted question used live pipeline path');
  });

  await check('Gate 5 — all 6 scripted snapshots return exact narratives', async () => {
    let verified = 0;

    for (const s of snapshots) {
      const datasetId = datasetBySlug.get(s.datasetSlug);
      if (!datasetId) throw new Error(`Missing dataset for slug ${s.datasetSlug}`);

      const conversationId = await createConversation(datasetId);
      const events = await collectSse('/api/query', {
        conversationId,
        datasetId,
        question: s.matchQuestion,
        sessionContext: { recentExchanges: [], lastResultSet: null },
      });

      const resultEvent = events.find((e) => e.event === 'result');
      if (!resultEvent) throw new Error(`No result event for ${s.datasetSlug}::${s.matchQuestion}`);

      const payload = resultEvent.data as { narrative?: string; snapshotUsed?: boolean };
      if (payload.snapshotUsed !== true) {
        throw new Error(`snapshotUsed not true for ${s.datasetSlug}::${s.matchQuestion}`);
      }
      if (payload.narrative !== s.outputPayload.narrative) {
        throw new Error(`Narrative mismatch for ${s.datasetSlug}::${s.matchQuestion}`);
      }

      verified++;
    }

    ok('Gate 5', `verified ${verified}/6 snapshots`);
  });

  await check('Gate 6 — snapshot query telemetry records snapshot_used=true', async () => {
    if (!snapshotConvForTelemetry) throw new Error('No snapshot conversation recorded from Gate 2');

    await new Promise((r) => setTimeout(r, 500));

    const { rows } = await pool.query<{ snapshot_used: boolean }>(
      `SELECT snapshot_used
       FROM pipeline_runs
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [snapshotConvForTelemetry],
    );

    if (rows.length === 0) {
      throw new Error('No pipeline_runs row found for snapshot conversation');
    }

    if (rows[0]!.snapshot_used !== true) {
      throw new Error(`Expected snapshot_used=true, got ${rows[0]!.snapshot_used}`);
    }

    ok('Gate 6', 'pipeline_runs.snapshot_used=true');
  });

  await check('Gate 7 — toggle snapshot mode OFF, scripted query no longer uses snapshot', async () => {
    await forceSnapshotMode(false);

    const datasetId = datasetBySlug.get('sunita')!;
    const conversationId = await createConversation(datasetId);

    const events = await collectSse('/api/query', {
      conversationId,
      datasetId,
      question: 'What was my total spending?',
      sessionContext: { recentExchanges: [], lastResultSet: null },
    });

    const resultEvent = events.find((e) => e.event === 'result');
    if (!resultEvent) throw new Error('No result event after toggling off');

    const payload = resultEvent.data as { snapshotUsed?: boolean };
    if (payload.snapshotUsed !== false) {
      throw new Error(`Expected snapshotUsed=false after toggle off, got ${payload.snapshotUsed}`);
    }

    ok('Gate 7', 'snapshot mode OFF confirmed');
  });

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Phase 6 result:  ${passed} passed / ${failed} failed`);
  console.log('══════════════════════════════════════════════════\n');

  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error('Fatal:', e);
  await pool.end();
  process.exit(1);
});
