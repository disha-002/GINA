import assert from 'node:assert';
import { test } from 'node:test';
import type { ColumnProfile } from '../semantic/profiler.js';
import { buildSqlCoderPrompt } from '../pipeline/sqlGenerator.js';

const flagColumn: ColumnProfile = {
  columnName: 'is_returned',
  postgresType: 'TEXT',
  businessLabel: 'is_returned',
  semanticType: 'flag',
  currency: null,
  description: '',
  sampleValues: ['true', 'false'],
  nullPct: 0,
  uniqueCount: 2,
  valueRange: null,
};

test('buildSqlCoderPrompt exposes semantic=flag and compound-filter / flag SQL rules', () => {
  const prompt = buildSqlCoderPrompt({
    question: 'What percentage of orders were returned?',
    tableName: 'dataset_abcd1234',
    columns: [flagColumn],
    metricDefinitions: '',
  });
  assert.ok(prompt.includes('semantic=flag'), 'column line should show semantic type');
  assert.ok(prompt.includes('Multi-dimensional filters'), 'shared rules should mention compound WHERE');
  assert.ok(prompt.includes('Flag / boolean-like TEXT'), 'shared rules should mention flag TEXT handling');
});
