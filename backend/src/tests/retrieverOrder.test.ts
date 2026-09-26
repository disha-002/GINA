import test from 'node:test';
import assert from 'node:assert/strict';
import type { ColumnProfile } from '../semantic/profiler.js';
import { orderColumnProfilesByRetrieval } from '../semantic/orderColumnsByRetrieval.js';

function col(name: string): ColumnProfile {
  return {
    columnName: name,
    businessLabel: name,
    semanticType: 'text',
    description: '',
    postgresType: 'TEXT',
    currency: null,
    sampleValues: [],
    nullPct: 0,
    uniqueCount: 1,
    valueRange: null,
  };
}

test('orderColumnProfilesByRetrieval puts retrieved columns first, preserves all', () => {
  const profiles = [col('a'), col('b'), col('c')];
  const retrieved = [
    { columnName: 'c', embeddingText: '', distance: 0.1 },
    { columnName: 'a', embeddingText: '', distance: 0.2 },
  ];
  const ordered = orderColumnProfilesByRetrieval(profiles, retrieved);
  assert.deepEqual(
    ordered.map((c) => c.columnName),
    ['c', 'a', 'b'],
  );
});

test('orderColumnProfilesByRetrieval ignores unknown retrieved names', () => {
  const profiles = [col('x'), col('y')];
  const retrieved = [{ columnName: 'missing', embeddingText: '', distance: 0 }];
  const ordered = orderColumnProfilesByRetrieval(profiles, retrieved);
  assert.deepEqual(
    ordered.map((c) => c.columnName),
    ['x', 'y'],
  );
});

test('orderColumnProfilesByRetrieval returns original when retrieved empty', () => {
  const profiles = [col('p'), col('q')];
  assert.equal(orderColumnProfilesByRetrieval(profiles, []), profiles);
});
