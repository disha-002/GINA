import assert from 'node:assert';
import { test } from 'node:test';
import type { ColumnProfile } from '../semantic/profiler.js';
import { tryTemplateSql } from '../pipeline/sqlTemplates.js';
import { validateSql } from '../pipeline/sqlValidator.js';

/** Proves §6.4 template tier emits whitelist-safe SQL when semantic columns exist. */
const demoColumns: ColumnProfile[] = [
  {
    columnName: 'amount',
    postgresType: 'NUMERIC',
    businessLabel: 'Amount',
    semanticType: 'amount',
    currency: 'GBP',
    description: 'x',
    sampleValues: ['1'],
    nullPct: 0,
    uniqueCount: 1,
    valueRange: null,
  },
  {
    columnName: 'category',
    postgresType: 'TEXT',
    businessLabel: 'Category',
    semanticType: 'category',
    currency: null,
    description: 'x',
    sampleValues: ['a'],
    nullPct: 0,
    uniqueCount: 1,
    valueRange: null,
  },
];

test('tryTemplateSql + validateSql for total / sum question', () => {
  const sql = tryTemplateSql('What was my total spending?', 'dataset_demo_sunita', demoColumns);
  assert.ok(sql, 'template should match sum intent');
  const v = validateSql(sql, ['dataset_demo_sunita']);
  assert.equal(v.valid, true);
});

test('tryTemplateSql + validateSql for top N question', () => {
  const sql = tryTemplateSql(
    'What were my top 5 categories by spend?',
    'dataset_demo_sunita',
    demoColumns,
  );
  assert.ok(sql);
  assert.equal(validateSql(sql, ['dataset_demo_sunita']).valid, true);
});
