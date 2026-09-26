#!/usr/bin/env node
/**
 * Eval runner: uploads a fixture CSV (or uses EVAL_DATASET_ID), runs each manifest case
 * against POST /api/query (SSE), scores intent / columns / optional SQL / expected result.
 *
 * Does not run automatically — invoke when the API is up and TEST_JWT is set.
 *
 *   TEST_JWT=eyJ… BASE_URL=http://127.0.0.1:3001 \
 *     node eval/scripts/run-manifest.mjs eval/bundles/micro/manifest.json
 *
 * Env:
 *   TEST_JWT or EVAL_JWT (required)
 *   BASE_URL (default http://127.0.0.1:3001)
 *   EVAL_DATASET_ID — skip upload; use existing dataset id (UUID with hyphens).
 *     You may also pass the Postgres table name dataset_<32hex> or bare 32-char hex; it is normalized.
 *   EVAL_CHECK_INTENT=1 — enforce planner intent vs manifest for SQL cases (default: skip intent check for SQL)
 *   EVAL_CHECK_RELEVANT_COLUMNS=1 — enforce relevant_columns as subset of planner columns (default: skip)
 *   EVAL_DEFAULT_SCALAR_ABS_TOL — default abs tolerance for numeric scalars when manifest omits abs_tol (default 0.02)
 *   EVAL_DEFAULT_TABLE_ABS_TOL — default for numeric cells in table results (default 0.02)
 *   EVAL_DEBUG_SQL=1 — longer response SQL snippet in reports when a case fails
 *   EVAL_DELAY_MS — wait this many milliseconds between cases (default 0). Use e.g. 10000 on free-tier Groq to reduce rate limits.
 *   EVAL_VERBOSE=0 — disable step-by-step logs to stderr (default: log each phase; JSON report still goes to stdout).
 *
 * Flags:
 *   --dataset-id=<uuid>   Override EVAL_DATASET_ID
 *   --base-url=<url>      Override BASE_URL
 *   --check-sql           Score token overlap between gold_sql (after table substitution) and response SQL
 */

import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_TABLE_ABS_TOL,
  relevantColumnsSubset,
  rowMatchesExpected,
  scalarOk,
} from '../lib/scoreHelpers.mjs';

const token = process.env.TEST_JWT ?? process.env.EVAL_JWT;

/** Step logs to stderr so stdout stays clean for `> report.json`. */
function evalVerbose() {
  return process.env.EVAL_VERBOSE !== '0' && process.env.EVAL_VERBOSE !== 'false';
}

function log(step, detail = null) {
  if (!evalVerbose()) return;
  if (detail != null && detail !== '') {
    console.error(`eval/run-manifest [${step}]`, detail);
  } else {
    console.error(`eval/run-manifest [${step}]`);
  }
}

function envTruthy(name) {
  const v = process.env[name];
  if (v == null || v === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

/** Milliseconds to sleep between cases (0 = no delay). Env: EVAL_DELAY_MS */
function parseEvalDelayMs() {
  const raw = process.env.EVAL_DELAY_MS;
  if (raw == null || String(raw).trim() === '') return 0;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const out = {
    manifestPath: null,
    datasetId: process.env.EVAL_DATASET_ID ?? null,
    baseUrl: process.env.BASE_URL ?? 'http://127.0.0.1:3001',
    checkSql: false,
    debugSql: envTruthy('EVAL_DEBUG_SQL'),
  };
  for (const a of argv) {
    if (a === '--check-sql') out.checkSql = true;
    else if (a.startsWith('--dataset-id=')) out.datasetId = a.slice('--dataset-id='.length);
    else if (a.startsWith('--base-url=')) out.baseUrl = a.slice('--base-url='.length);
    else if (!a.startsWith('-')) out.manifestPath = a;
  }
  return out;
}

/**
 * API routes use `datasets.id` (UUID). Dynamic SQL tables are named `dataset_` + uuid without hyphens.
 * Accept either form so copy-paste from SQL or the UI does not break.
 */
function normalizeEvalDatasetId(raw) {
  const s = String(raw).trim();
  if (!s) return null;
  const uuidWithHyphens =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidWithHyphens.test(s)) return s.toLowerCase();

  let hex32 = null;
  const asTable = /^dataset_([0-9a-f]{32})$/i.exec(s);
  if (asTable) hex32 = asTable[1].toLowerCase();
  else if (/^[0-9a-f]{32}$/i.test(s)) hex32 = s.toLowerCase();

  if (hex32) {
    return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20)}`;
  }
  return s;
}

function fail(msg, detail) {
  console.error('eval/run-manifest:', msg);
  if (detail != null) console.error(detail);
  process.exit(1);
}

/** Parse SSE text into { event, data } where data is parsed JSON when possible. */
function parseSseEvents(raw) {
  /** @type {{ event: string; data: unknown }[]} */
  const events = [];
  const blocks = raw.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let ev = 'message';
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) ev = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.replace(/^data:\s?/, ''));
    }
    if (dataLines.length === 0) continue;
    const joined = dataLines.join('');
    try {
      events.push({ event: ev, data: JSON.parse(joined) });
    } catch {
      events.push({ event: ev, data: joined });
    }
  }
  return events;
}

function lastPlannerComplete(events) {
  const hits = events.filter(
    (e) =>
      e.event === 'step' &&
      e.data &&
      typeof e.data === 'object' &&
      e.data.step === 'planner' &&
      e.data.status === 'complete',
  );
  return hits.length ? hits[hits.length - 1].data : null;
}

function lastResultPayload(events) {
  const hits = events.filter((e) => e.event === 'result' && e.data && typeof e.data === 'object');
  return hits.length ? hits[hits.length - 1].data : null;
}

function hasErrorEvent(events) {
  return events.some((e) => e.event === 'error');
}

/** Parse a number from mixed strings: "12.3%", "£1,234.50", "1,000". */
function parseNumberFromString(s) {
  if (s == null) return null;
  const str = String(s).trim();
  if (!str) return null;
  const pct = str.match(/(-?[\d,.]+)\s*%/);
  if (pct) {
    const n = parseFloat(pct[1].replace(/,/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  const stripped = str.replace(/[£$€\s]/g, '');
  const numMatch = stripped.match(/-?[\d,]+(?:\.\d+)?/);
  if (numMatch) {
    const n = parseFloat(numMatch[0].replace(/,/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function parseNumberFromCell(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  return parseNumberFromString(String(raw));
}

/**
 * First numeric scalar from API result: big_number value, keyFigure, single-point charts, then resultTable
 * (preferring column names that look like aggregates).
 */
function extractScalarFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const ct = payload.chartType;
  const cd = payload.chartData;

  if (ct === 'big_number' && cd && typeof cd === 'object' && 'value' in cd && !('datasets' in cd)) {
    const v = /** @type {{ value: number }} */ (cd).value;
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
  }

  const kf = payload.keyFigure;
  const fromKf = parseNumberFromCell(kf);
  if (fromKf != null) return fromKf;

  if (cd && typeof cd === 'object' && 'datasets' in cd && Array.isArray(cd.datasets)) {
    const ds = cd.datasets;
    if (ds.length === 1 && Array.isArray(ds[0]?.data) && ds[0].data.length === 1) {
      const n = ds[0].data[0];
      if (typeof n === 'number' && !Number.isNaN(n)) return n;
    }
  }

  const rt = payload.resultTable;
  if (rt && Array.isArray(rt.rows) && rt.rows.length > 0) {
    const row = rt.rows[0];
    if (row && typeof row === 'object') {
      const keys = Object.keys(row);
      const prefer = /(count|total|sum|avg|mean|revenue|qty|quantity|amount|value|pct|percent)/i;
      for (const k of keys) {
        if (prefer.test(k)) {
          const n = parseNumberFromCell(row[k]);
          if (n != null) return n;
        }
      }
      for (const k of keys) {
        const n = parseNumberFromCell(row[k]);
        if (n != null) return n;
      }
    }
  }

  return null;
}

function rowsFromResultTable(payload) {
  const rt = payload?.resultTable;
  if (!rt || !Array.isArray(rt.rows)) return [];
  return rt.rows.map((row) => {
    const o = {};
    if (row && typeof row === 'object') {
      for (const [k, v] of Object.entries(row)) {
        o[k] = v === null || v === undefined ? '' : String(v);
      }
    }
    return o;
  });
}

/**
 * Multiset match: each expected row must pair with a distinct actual row that matches on expected keys.
 * When orderMatters, compare row-by-row index (still only expected keys must match).
 * @param {{ columnAliases?: Record<string, string[]> }} [rowOpts] passed to rowMatchesExpected (alias resolution).
 */
function tableEquivalent(actualRows, expectedRows, orderMatters, tableAbsTol, rowOpts = {}) {
  if (orderMatters) {
    if (actualRows.length !== expectedRows.length) return false;
    for (let i = 0; i < expectedRows.length; i++) {
      if (!rowMatchesExpected(actualRows[i], expectedRows[i], tableAbsTol, rowOpts)) return false;
    }
    return true;
  }
  if (actualRows.length < expectedRows.length) return false;
  const used = new Set();
  for (const er of expectedRows) {
    let found = -1;
    for (let i = 0; i < actualRows.length; i++) {
      if (used.has(i)) continue;
      if (rowMatchesExpected(actualRows[i], er, tableAbsTol, rowOpts)) {
        found = i;
        break;
      }
    }
    if (found < 0) return false;
    used.add(found);
  }
  return true;
}

function sqlTokens(s) {
  return s
    .toLowerCase()
    .replace(/"/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['select', 'from', 'where', 'and', 'the', 'for'].includes(w));
}

function sqlTokenJaccard(gold, actual) {
  const ga = new Set(sqlTokens(gold));
  const aa = new Set(sqlTokens(actual));
  let inter = 0;
  for (const x of ga) if (aa.has(x)) inter++;
  const union = ga.size + aa.size - inter;
  return union === 0 ? 0 : inter / union;
}

function substituteTableName(sql, placeholder, tableName) {
  if (!sql || !placeholder) return sql;
  return sql.split(placeholder).join(tableName);
}

function pickCsvPath(manifest, manifestDir) {
  /** @type {string | null} */
  let first = null;
  for (const c of manifest.cases ?? []) {
    const p = c.data?.csv_path;
    if (typeof p === 'string' && p.length > 0) {
      if (!first) first = p;
    }
  }
  if (!first) return null;
  return resolve(manifestDir, first);
}

async function postJson(url, headers, body) {
  return fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function ensureUser(base, authHeader) {
  const sync = await postJson(`${base}/api/users/sync`, { Authorization: authHeader }, {});
  if (!sync.ok) fail('users/sync failed', await sync.text());
}

async function uploadCsv(base, authHeader, csvPath, filename) {
  const buf = readFileSync(csvPath);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'text/csv' }), filename);
  const up = await fetch(`${base}/api/datasets/upload`, {
    method: 'POST',
    headers: { Authorization: authHeader },
    body: form,
  });
  if (!up.ok) fail(`upload ${up.status}`, await up.text());
  const uploaded = await up.json();
  const datasetId = uploaded.dataset?.id;
  if (!datasetId) fail('upload response missing dataset.id', JSON.stringify(uploaded, null, 2));
  return datasetId;
}

async function fetchSemantic(base, authHeader, datasetId) {
  const sem = await fetch(`${base}/api/datasets/${datasetId}/semantic`, {
    headers: { Authorization: authHeader },
  });
  if (!sem.ok) fail('GET semantic failed', await sem.text());
  const j = await sem.json();
  const tableName = j.schemaJson?.tableName;
  if (!tableName || typeof tableName !== 'string') {
    fail('semantic response missing schemaJson.tableName');
  }
  return { tableName };
}

async function createConversation(base, authHeader, datasetId) {
  const conv = await postJson(
    `${base}/api/datasets/${datasetId}/conversations`,
    { Authorization: authHeader },
    {},
  );
  if (!conv.ok) fail('create conversation', await conv.text());
  const { id } = await conv.json();
  return id;
}

async function runQuery(base, authHeader, conversationId, datasetId, question) {
  const body = {
    conversationId,
    datasetId,
    question,
    sessionContext: { recentExchanges: [], lastResultSet: null },
  };
  const res = await postJson(`${base}/api/query`, { Authorization: authHeader, Accept: 'text/event-stream' }, body);
  if (!res.ok) fail(`/api/query ${res.status}`, await res.text());
  return res.text();
}

async function main() {
  const checkIntentSql = process.env.EVAL_CHECK_INTENT === '1';
  const checkRelevantColumns = process.env.EVAL_CHECK_RELEVANT_COLUMNS === '1';

  const args = parseArgs(process.argv.slice(2));
  const manifestPath = args.manifestPath ? resolve(process.cwd(), args.manifestPath) : null;
  if (!manifestPath || !existsSync(manifestPath)) {
    fail(
      'Usage: node eval/scripts/run-manifest.mjs <path/to/manifest.json> [--dataset-id=] [--base-url=] [--check-sql]',
    );
  }
  if (!token) fail('Set TEST_JWT or EVAL_JWT');

  log('start', {
    manifestPath,
    baseUrl: args.baseUrl,
    checkSql: args.checkSql,
    debugSql: args.debugSql,
    checkIntentSql,
    checkRelevantColumns,
    jwt: 'set',
  });

  const manifestRaw = readFileSync(manifestPath, 'utf8');
  /** @type {any} */
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (e) {
    fail(`invalid manifest JSON: ${e.message}`);
  }
  if (manifest.version !== '1' || !Array.isArray(manifest.cases)) fail('manifest must be version 1 with cases[]');

  log('manifest_parsed', {
    bundle: manifest.name ?? '(no name)',
    version: manifest.version,
    cases: manifest.cases.length,
  });

  const manifestDir = dirname(manifestPath);
  const base = args.baseUrl.replace(/\/$/, '');
  const authHeader = `Bearer ${token}`;

  log('health', `GET ${base}/health`);
  const health = await fetch(`${base}/health`);
  if (!health.ok) fail(`/health ${health.status}`);
  log('health_ok', health.status);

  log('users_sync', 'POST /api/users/sync');
  await ensureUser(base, authHeader);
  log('users_sync_ok');

  const rawDatasetId = args.datasetId ? String(args.datasetId).trim() : '';
  let datasetId = rawDatasetId ? normalizeEvalDatasetId(rawDatasetId) : null;
  if (rawDatasetId && /^dataset_[0-9a-f]{32}$/i.test(rawDatasetId)) {
    log('dataset_id_normalized', { from: rawDatasetId, to: datasetId });
  } else if (rawDatasetId && /^[0-9a-f]{32}$/i.test(rawDatasetId) && !rawDatasetId.includes('-')) {
    log('dataset_id_normalized', { from: rawDatasetId, to: datasetId });
  }
  const csvResolved = pickCsvPath(manifest, manifestDir);

  if (!datasetId) {
    if (!csvResolved || !existsSync(csvResolved)) {
      fail(
        'No EVAL_DATASET_ID / --dataset-id and no case with data.csv_path pointing to a readable file. Provide a dataset or a fixture CSV.',
      );
    }
    log('dataset_upload', { csvPath: csvResolved });
    const filename = `eval_${basename(csvResolved)}`;
    datasetId = await uploadCsv(base, authHeader, csvResolved, filename);
    log('dataset_upload_ok', { datasetId });
  } else {
    log('dataset_reuse', { datasetId, source: 'EVAL_DATASET_ID or --dataset-id' });
  }

  log('semantic', `GET /api/datasets/${datasetId}/semantic`);
  const { tableName } = await fetchSemantic(base, authHeader, datasetId);
  log('semantic_ok', { tableName });

  /** One conversation for all cases; each POST still sends empty sessionContext (no cross-case chat leakage). */
  log('conversation_create', `POST /api/datasets/${datasetId}/conversations`);
  const conversationId = await createConversation(base, authHeader, datasetId);
  log('conversation_ok', { conversationId });

  const caseDelayMs = parseEvalDelayMs();
  if (caseDelayMs > 0) {
    log('delay_between_cases', `${caseDelayMs}ms (EVAL_DELAY_MS)`);
  }

  /** @type {any[]} */
  const caseReports = [];
  let failures = 0;

  const cases = manifest.cases;
  for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
    if (caseIndex > 0 && caseDelayMs > 0) {
      log('case_sleep', { before: cases[caseIndex]?.id, ms: caseDelayMs });
      await sleep(caseDelayMs);
    }
    const c = cases[caseIndex];
    const id = c.id;
    log('case_start', {
      index: caseIndex + 1,
      total: cases.length,
      id,
      questionPreview: String(c.question ?? '').slice(0, 120),
    });

    const placeholder =
      (c.data?.table_placeholder && String(c.data.table_placeholder)) || 'dataset_<FIXTURE_TABLE>';
    const goldSubstituted =
      typeof c.expect?.gold_sql === 'string'
        ? substituteTableName(c.expect.gold_sql, placeholder, tableName)
        : null;

    let sseText;
    try {
      log('case_query', { id, path: 'POST /api/query (SSE)' });
      sseText = await runQuery(base, authHeader, conversationId, datasetId, c.question);
      log('case_query_done', { id, sseBytes: sseText?.length ?? 0 });
    } catch (e) {
      log('case_query_error', { id, error: String(e?.message ?? e) });
      failures++;
      caseReports.push({
        id,
        ok: false,
        error: String(e?.message ?? e),
      });
      continue;
    }

    const events = parseSseEvents(sseText);
    const stepEvents = events.filter((e) => e.event === 'step').length;
    const resultEvents = events.filter((e) => e.event === 'result').length;
    const errorEvents = events.filter((e) => e.event === 'error').length;
    log('case_sse_parsed', { id, totalEvents: events.length, stepEvents, resultEvents, errorEvents });

    if (hasErrorEvent(events)) {
      log('case_sse_error_event', { id, tail: sseText.slice(-400) });
      failures++;
      caseReports.push({
        id,
        ok: false,
        error: 'SSE contained event:error',
        sseTail: sseText.slice(-600),
      });
      continue;
    }

    const planner = lastPlannerComplete(events);
    const payload = lastResultPayload(events);
    log('case_payload', {
      id,
      hasPlanner: !!planner,
      plannerIntent: planner?.intent ?? null,
      hasResultPayload: !!payload,
      cacheHit: payload?.cacheHit ?? null,
    });

    const expect = c.expect;

    /** @type {Record<string, unknown>} */
    const checks = {};
    let ok = true;

    if (expect.intent === 'conversational') {
      log('case_score', { id, branch: 'conversational' });
      if (!planner) {
        checks.intent = { pass: false, note: 'no planner complete step (cache path?)', expected: expect.intent };
        ok = false;
      } else {
        const match = planner.intent === expect.intent;
        checks.intent = { pass: match, expected: expect.intent, actual: planner.intent };
        if (!match) ok = false;
      }
      const nr = expect.result;
      if (nr.type === 'conversational' && nr.narrative_contains?.length) {
        const text = String(payload?.narrative ?? '');
        const subs = nr.narrative_contains.map((s) => ({
          substring: s,
          pass: text.toLowerCase().includes(String(s).toLowerCase()),
        }));
        checks.narrative_contains = subs;
        if (subs.some((x) => !x.pass)) ok = false;
      }
      log('case_checks_conversational', { id, ok, intent: checks.intent });
    } else {
      log('case_score', { id, branch: 'sql', expectResultType: expect.result?.type ?? null });
      if (!planner) {
        checks.intent = { pass: false, note: 'no planner complete (response cache skipped planner?)', expected: expect.intent };
        ok = false;
      } else if (checkIntentSql) {
        const match = planner.intent === expect.intent;
        checks.intent = { pass: match, expected: expect.intent, actual: planner.intent };
        if (!match) ok = false;
      } else {
        checks.intent = {
          skipped: true,
          expected: expect.intent,
          actual: planner.intent,
          note: 'set EVAL_CHECK_INTENT=1 to fail on intent mismatch for SQL cases',
        };
      }

      if (expect.relevant_columns?.length) {
        const actualCols = planner?.relevantColumns;
        if (!checkRelevantColumns) {
          checks.relevant_columns = {
            skipped: true,
            expected: expect.relevant_columns,
            actual: actualCols ?? null,
            note: 'set EVAL_CHECK_RELEVANT_COLUMNS=1 to enforce (subset match)',
          };
        } else if (!Array.isArray(actualCols)) {
          checks.relevant_columns = {
            pass: false,
            expected: expect.relevant_columns,
            actual: actualCols ?? null,
            mode: 'subset',
          };
          ok = false;
        } else {
          const pass = relevantColumnsSubset(expect.relevant_columns, actualCols);
          checks.relevant_columns = {
            pass,
            expected: expect.relevant_columns,
            actual: actualCols,
            mode: 'subset',
          };
          if (!pass) ok = false;
        }
      }

      if (args.checkSql && goldSubstituted && payload?.sql) {
        const j = sqlTokenJaccard(goldSubstituted, String(payload.sql));
        checks.sql_jaccard = j;
        checks.sql = { pass: j >= 0.35, threshold: 0.35, note: 'token Jaccard vs gold_sql (heuristic)' };
        if (!checks.sql.pass) ok = false;
      }

      if (expect.result?.type === 'scalar') {
        const num = extractScalarFromPayload(payload);
        const pass = num != null && scalarOk(num, expect.result);
        checks.scalar = { pass, actual: num, expected: expect.result.value };
        if (!pass) ok = false;
      } else if (expect.result?.type === 'table') {
        const expPath = resolve(manifestDir, expect.result.path);
        const tableTol =
          expect.result.table_abs_tol !== undefined && expect.result.table_abs_tol !== null
            ? expect.result.table_abs_tol
            : DEFAULT_TABLE_ABS_TOL;
        if (!existsSync(expPath)) {
          checks.table = { pass: false, error: `missing expected file ${expect.result.path}` };
          ok = false;
        } else {
          const expectedRows = JSON.parse(readFileSync(expPath, 'utf8'));
          const actualRows = rowsFromResultTable(payload);
          const columnAliases =
            expect.result.column_aliases && typeof expect.result.column_aliases === 'object'
              ? expect.result.column_aliases
              : {};
          const pass = tableEquivalent(
            actualRows,
            expectedRows,
            expect.result.row_order_matters === true,
            tableTol,
            { columnAliases },
          );
          checks.table = {
            pass,
            expectedRowCount: expectedRows.length,
            actualRowCount: actualRows.length,
            table_abs_tol: tableTol,
          };
          if (!pass) ok = false;
        }
      }
      log('case_checks_sql', {
        id,
        ok,
        intent: checks.intent,
        relevant_columns: checks.relevant_columns,
        sql_jaccard: checks.sql_jaccard,
        scalar: checks.scalar,
        table: checks.table,
      });
    }

    if (!ok && payload?.sql && typeof payload.sql === 'string') {
      const maxLen = args.debugSql ? 12000 : 4000;
      let sqlText = payload.sql;
      if (sqlText.length > maxLen) sqlText = `${sqlText.slice(0, maxLen)}\n…[truncated]`;
      checks.responseSql = sqlText;
    }

    if (!ok) failures++;
    log('case_end', { id, ok, failedSoFar: failures });
    caseReports.push({
      id,
      ok,
      question: c.question,
      checks,
      narrativePreview: payload?.narrative ? String(payload.narrative).slice(0, 200) : null,
    });
  }

  log('report_build', {
    total: manifest.cases.length,
    failed: failures,
    passed: failures === 0,
  });

  const report = {
    bundle: manifest.name,
    manifestPath: pathToFileURL(manifestPath).href,
    baseUrl: base,
    datasetId,
    tableName,
    conversationId,
    evalConfig: {
      checkIntentForSql: checkIntentSql,
      checkRelevantColumns,
      debugSql: args.debugSql,
      caseDelayMs,
    },
    passed: failures === 0,
    summary: { total: manifest.cases.length, failed: failures },
    cases: caseReports,
    ranAt: new Date().toISOString(),
  };

  log('stdout_json', 'writing full report to stdout');
  console.log(JSON.stringify(report, null, 2));
  log('exit', { code: failures > 0 ? 1 : 0 });
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
