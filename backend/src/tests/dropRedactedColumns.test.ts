import assert from 'node:assert';
import { test } from 'node:test';
import { parseCSV } from '../utils/csvParser.js';
import { dropColumnsFromCsv } from '../pii/dropRedactedColumns.js';

test('dropColumnsFromCsv removes one column and preserves rows', () => {
  const csv = 'a,b,c\n1,2,3\n4,5,6\n';
  const out = dropColumnsFromCsv(csv, ['b']);
  const parsed = parseCSV(out);
  assert.deepStrictEqual(parsed.headers, ['a', 'c']);
  assert.deepStrictEqual(parsed.rows, [
    { a: '1', c: '3' },
    { a: '4', c: '6' },
  ]);
});

test('dropColumnsFromCsv ignores unknown column names', () => {
  const csv = 'a,b\nx,y\n';
  const out = dropColumnsFromCsv(csv, ['missing']);
  assert.strictEqual(out, csv);
});

test('dropColumnsFromCsv empty columnsToDrop returns input unchanged', () => {
  const csv = 'a,b\n1,2\n';
  assert.strictEqual(dropColumnsFromCsv(csv, []), csv);
});

test('dropColumnsFromCsv all columns dropped yields empty string and parseCSV has no headers', () => {
  const csv = 'only\n1\n';
  const out = dropColumnsFromCsv(csv, ['only']);
  assert.strictEqual(out, '');
  const parsed = parseCSV(out);
  assert.deepStrictEqual(parsed.headers, []);
  assert.deepStrictEqual(parsed.rows, []);
});
