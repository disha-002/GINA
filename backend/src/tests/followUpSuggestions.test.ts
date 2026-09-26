import assert from 'node:assert';
import { test } from 'node:test';
import type { ColumnProfile } from '../semantic/profiler.js';
import { buildFollowUpSuggestions } from '../pipeline/followUpTemplates.js';

/** Phase 7 Person A — 0-row SQL path still returns follow-ups when schema has amount/category/date signals. */
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

test('buildFollowUpSuggestions returns 2–3 items for typical SME schema', () => {
  const s = buildFollowUpSuggestions(richColumns, 'simple_query');
  assert.ok(s.length >= 2 && s.length <= 3, `got ${s.length} suggestions`);
});
