import assert from 'node:assert';
import { test } from 'node:test';
import type { ColumnProfile } from '../semantic/profiler.js';
import { mergeFollowUpsWithHeuristic } from '../pipeline/followUpNarrator.js';

const richColumns: ColumnProfile[] = [
  {
    columnName: 'date',
    postgresType: 'DATE',
    businessLabel: 'Date',
    semanticType: 'date',
    currency: null,
    description: 'd',
    sampleValues: [],
    nullPct: 0,
    uniqueCount: 1,
    valueRange: null,
  },
  {
    columnName: 'category',
    postgresType: 'TEXT',
    businessLabel: 'Cat',
    semanticType: 'category',
    currency: null,
    description: 'c',
    sampleValues: [],
    nullPct: 0,
    uniqueCount: 1,
    valueRange: null,
  },
  {
    columnName: 'amount',
    postgresType: 'NUMERIC',
    businessLabel: 'Amt',
    semanticType: 'amount',
    currency: 'GBP',
    description: 'a',
    sampleValues: [],
    nullPct: 0,
    uniqueCount: 1,
    valueRange: null,
  },
];

test('mergeFollowUpsWithHeuristic returns heuristics when primary is empty', () => {
  const m = mergeFollowUpsWithHeuristic([], richColumns, 'simple_query');
  assert.ok(m.length >= 2 && m.length <= 3);
});

test('mergeFollowUpsWithHeuristic keeps two model strings without padding past three', () => {
  const m = mergeFollowUpsWithHeuristic(
    ['What drove Q1?', 'Compare regions next'],
    richColumns,
    'simple_query',
  );
  assert.strictEqual(m.length, 2);
  assert.strictEqual(m[0], 'What drove Q1?');
});

test('mergeFollowUpsWithHeuristic pads when model returns only one string', () => {
  const m = mergeFollowUpsWithHeuristic(['Only one question'], richColumns, 'simple_query');
  assert.strictEqual(m.length, 3);
  assert.strictEqual(m[0], 'Only one question');
});
