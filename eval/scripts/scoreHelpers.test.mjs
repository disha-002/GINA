import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cellMatches,
  DEFAULT_TABLE_ABS_TOL,
  rowMatchesExpected,
  scalarOk,
} from '../lib/scoreHelpers.mjs';

test('cellMatches treats close floats as equal with table tolerance', () => {
  assert.equal(cellMatches('13034.99', '13034.990', DEFAULT_TABLE_ABS_TOL), true);
  assert.equal(cellMatches('479.1554', '479.16', 0.02), true);
});

test('scalarOk uses default abs_tol when manifest omits abs_tol', () => {
  assert.equal(scalarOk(479.1554, { value: 479.16 }), true);
  assert.equal(scalarOk(158.13709570957096, { value: 158.14 }), true);
});

test('scalarOk respects explicit abs_tol zero', () => {
  assert.equal(scalarOk(1.001, { value: 1, abs_tol: 0 }), false);
});

test('scalarOk fraction_as_percent maps 0.12 to 12 vs gold', () => {
  assert.equal(scalarOk(0.12, { value: 12, compare_as: 'fraction_as_percent' }), true);
});

test('rowMatchesExpected resolves total_revenue to sum_revenue in gold', () => {
  const actual = { country: 'US', total_revenue: '13034.99' };
  const expected = { country: 'US', sum_revenue: 13034.99 };
  assert.equal(rowMatchesExpected(actual, expected, 0.02, { columnAliases: {} }), true);
});

test('rowMatchesExpected uses manifest column_aliases', () => {
  const actual = { a: '1', custom_metric: '42' };
  const expected = { a: '1', gold_name: 42 };
  assert.equal(
    rowMatchesExpected(actual, expected, 0.02, { columnAliases: { gold_name: ['custom_metric'] } }),
    true,
  );
});
