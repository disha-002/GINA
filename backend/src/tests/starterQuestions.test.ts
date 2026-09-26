import assert from 'node:assert';
import { test } from 'node:test';
import type { ColumnProfile } from '../semantic/profiler.js';
import {
  GENERIC_STARTERS_NO_SCHEMA,
  buildHeuristicStarters,
  mergeStartersWithDefaults,
} from '../pipeline/starterQuestions.js';

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

/** No amount column — e.g. HR / codes / labels only */
const noAmountColumns: ColumnProfile[] = [
  {
    columnName: 'designation',
    postgresType: 'TEXT',
    businessLabel: 'Designation',
    semanticType: 'text',
    currency: null,
    description: '',
    sampleValues: [],
    nullPct: 0,
    uniqueCount: 1,
    valueRange: null,
  },
  {
    columnName: 'employee_code',
    postgresType: 'TEXT',
    businessLabel: 'Employee Code',
    semanticType: 'identifier',
    currency: null,
    description: '',
    sampleValues: [],
    nullPct: 0,
    uniqueCount: 1,
    valueRange: null,
  },
];

test('mergeStartersWithDefaults fills from heuristics when model returns nothing', () => {
  const m = mergeStartersWithDefaults([], []);
  assert.strictEqual(m.length, 4);
  assert.deepStrictEqual(m, [...GENERIC_STARTERS_NO_SCHEMA]);
});

test('mergeStartersWithDefaults keeps four unique model questions when valid', () => {
  const m = mergeStartersWithDefaults(
    [
      { title: 'A', question: 'One?' },
      { title: 'B', question: 'Two?' },
      { title: 'C', question: 'Three?' },
      { title: 'D', question: 'Four?' },
    ],
    richColumns,
  );
  assert.strictEqual(m.length, 4);
  assert.strictEqual(m[0]!.question, 'One?');
});

test('mergeStartersWithDefaults pads partial model output using schema heuristics', () => {
  const m = mergeStartersWithDefaults([{ title: 'X', question: 'Only one?' }], richColumns);
  assert.strictEqual(m.length, 4);
  assert.strictEqual(m[0]!.question, 'Only one?');
  assert.ok(m.some((x) => /top 5/i.test(x.question)));
});

test('buildHeuristicStarters avoids spend/amount wording when there is no amount column', () => {
  const h = buildHeuristicStarters(noAmountColumns);
  assert.strictEqual(h.length, 4);
  const joined = h.map((x) => x.question).join(' ').toLowerCase();
  assert.ok(!joined.includes('spent'), 'should not mention spending');
  assert.ok(!joined.includes('amount'), 'should not mention amount');
  assert.ok(!joined.includes('spend'), 'should not mention spend');
});
