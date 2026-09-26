#!/usr/bin/env node
/**
 * Validates eval bundle manifest.json files against manifest v1 rules
 * (structural checks only; no extra npm dependencies).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const INTENTS = new Set([
  'conversational',
  'simple_query',
  'complex_query',
  'follow_up_cache',
]);

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function fail(msg) {
  console.error(`validate-manifest: ${msg}`);
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
}

function validateExpectResult(result, ctx) {
  assert(result && typeof result === 'object', `${ctx}: expect.result must be an object`);
  const t = result.type;
  assert(
    t === 'scalar' || t === 'table' || t === 'conversational',
    `${ctx}: expect.result.type must be scalar | table | conversational`,
  );
  if (t === 'scalar') {
    assert('value' in result, `${ctx}: scalar result requires value`);
    const v = result.value;
    assert(
      typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean',
      `${ctx}: scalar value must be number, string, or boolean`,
    );
    if (result.abs_tol !== undefined) {
      assert(typeof result.abs_tol === 'number' && result.abs_tol >= 0, `${ctx}: abs_tol must be >= 0`);
    }
    if (result.rel_tol !== undefined) {
      assert(typeof result.rel_tol === 'number' && result.rel_tol >= 0, `${ctx}: rel_tol must be >= 0`);
    }
    if (result.compare_as !== undefined) {
      assert(
        result.compare_as === 'fraction_as_percent',
        `${ctx}: compare_as must be fraction_as_percent when set`,
      );
    }
    const extra = Object.keys(result).filter(
      (k) => !['type', 'value', 'abs_tol', 'rel_tol', 'compare_as'].includes(k),
    );
    assert(extra.length === 0, `${ctx}: unexpected keys on scalar result: ${extra.join(', ')}`);
  } else if (t === 'table') {
    assert(typeof result.path === 'string' && result.path.length > 0, `${ctx}: table result requires path`);
    if (result.row_order_matters !== undefined) {
      assert(typeof result.row_order_matters === 'boolean', `${ctx}: row_order_matters must be boolean`);
    }
    if (result.table_abs_tol !== undefined) {
      assert(typeof result.table_abs_tol === 'number' && result.table_abs_tol >= 0, `${ctx}: table_abs_tol must be >= 0`);
    }
    if (result.column_aliases !== undefined) {
      assert(
        result.column_aliases && typeof result.column_aliases === 'object' && !Array.isArray(result.column_aliases),
        `${ctx}: column_aliases must be an object`,
      );
      for (const [k, v] of Object.entries(result.column_aliases)) {
        assert(typeof k === 'string' && k.length > 0, `${ctx}: column_aliases keys must be non-empty strings`);
        assert(Array.isArray(v), `${ctx}: column_aliases.${k} must be an array of strings`);
        for (const a of v) assert(typeof a === 'string' && a.length > 0, `${ctx}: column_aliases entries must be non-empty strings`);
      }
    }
    const extra = Object.keys(result).filter(
      (k) => !['type', 'path', 'row_order_matters', 'table_abs_tol', 'column_aliases'].includes(k),
    );
    assert(extra.length === 0, `${ctx}: unexpected keys on table result: ${extra.join(', ')}`);
  } else {
    if (result.narrative_contains !== undefined) {
      assert(Array.isArray(result.narrative_contains), `${ctx}: narrative_contains must be an array`);
      for (const s of result.narrative_contains) {
        assert(typeof s === 'string' && s.length > 0, `${ctx}: narrative_contains entries must be non-empty strings`);
      }
    }
    const extra = Object.keys(result).filter((k) => !['type', 'narrative_contains'].includes(k));
    assert(extra.length === 0, `${ctx}: unexpected keys on conversational result: ${extra.join(', ')}`);
  }
}

function validateCase(c, manifestDir, seenIds) {
  const ctx = `case "${c?.id ?? '?'}"`;
  assert(c && typeof c === 'object', `${ctx}: case must be an object`);
  assert(typeof c.id === 'string' && ID_RE.test(c.id), `${ctx}: id must match ${ID_RE}`);
  assert(!seenIds.has(c.id), `duplicate case id: ${c.id}`);
  seenIds.add(c.id);
  assert(typeof c.question === 'string' && c.question.length > 0, `${ctx}: question required`);

  const allowed = new Set(['id', 'question', 'data', 'expect']);
  for (const k of Object.keys(c)) assert(allowed.has(k), `${ctx}: unknown key "${k}"`);

  if (c.data !== undefined) {
    assert(typeof c.data === 'object' && c.data !== null, `${ctx}: data must be an object`);
    const dk = Object.keys(c.data);
    for (const k of dk) assert(['csv_path', 'table_placeholder'].includes(k), `${ctx}: unknown data key "${k}"`);
    if (c.data.csv_path !== undefined) {
      assert(typeof c.data.csv_path === 'string' && c.data.csv_path.length > 0, `${ctx}: data.csv_path invalid`);
      const p = resolve(manifestDir, c.data.csv_path);
      assert(existsSync(p), `${ctx}: data.csv_path not found: ${c.data.csv_path}`);
    }
    if (c.data.table_placeholder !== undefined) {
      assert(typeof c.data.table_placeholder === 'string', `${ctx}: data.table_placeholder must be a string`);
    }
  }

  assert(c.expect && typeof c.expect === 'object', `${ctx}: expect required`);
  const ex = c.expect;
  const exKeys = Object.keys(ex);
  for (const k of exKeys) assert(['intent', 'relevant_columns', 'gold_sql', 'result'].includes(k), `${ctx}: unknown expect key "${k}"`);

  assert(typeof ex.intent === 'string' && INTENTS.has(ex.intent), `${ctx}: invalid intent`);
  if (ex.relevant_columns !== undefined) {
    assert(Array.isArray(ex.relevant_columns), `${ctx}: relevant_columns must be an array`);
    for (const col of ex.relevant_columns) {
      assert(typeof col === 'string' && col.length > 0, `${ctx}: relevant_columns entries must be non-empty strings`);
    }
  }
  if (ex.gold_sql !== undefined && ex.gold_sql !== null) {
    assert(typeof ex.gold_sql === 'string', `${ctx}: gold_sql must be string or null`);
  }

  validateExpectResult(ex.result, `${ctx}.expect`);

  if (ex.result.type === 'table') {
    const tp = resolve(manifestDir, ex.result.path);
    assert(existsSync(tp), `${ctx}: table expected file not found: ${ex.result.path}`);
  }

  if (ex.intent === 'conversational') {
    assert(ex.result.type === 'conversational', `${ctx}: conversational intent requires result.type conversational`);
    assert(ex.gold_sql === undefined || ex.gold_sql === null, `${ctx}: conversational cases should omit gold_sql or set null`);
  } else {
    assert(ex.gold_sql !== undefined && ex.gold_sql !== null && ex.gold_sql.length > 0, `${ctx}: non-conversational cases require gold_sql`);
  }
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node eval/scripts/validate-manifest.mjs <path/to/manifest.json>');
    process.exit(1);
  }
  const manifestPath = resolve(process.cwd(), arg);
  assert(existsSync(manifestPath), `file not found: ${manifestPath}`);

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    fail(`invalid JSON: ${e.message}`);
  }

  const manifestDir = dirname(manifestPath);
  assert(manifest.version === '1', 'manifest.version must be "1"');
  assert(typeof manifest.name === 'string' && manifest.name.length > 0, 'manifest.name required');
  assert(Array.isArray(manifest.cases) && manifest.cases.length > 0, 'manifest.cases must be a non-empty array');

  const topKeys = Object.keys(manifest);
  for (const k of topKeys) {
    assert(['$', 'version', 'name', 'description', 'cases'].includes(k) || k.startsWith('$'), `unknown top-level key: ${k}`);
  }

  const seen = new Set();
  for (const c of manifest.cases) {
    validateCase(c, manifestDir, seen);
  }

  console.log(`OK: ${manifestPath} (${manifest.cases.length} case(s))`);
}

main();
