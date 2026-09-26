import assert from 'node:assert';
import { test } from 'node:test';
import { validateSql } from '../pipeline/sqlValidator.js';

const allowed = ['dataset_demo_sunita'];

test('rejects multi-statement injection', () => {
  const sql = `SELECT * FROM dataset_demo_sunita; DROP TABLE dataset_demo_sunita;`;
  const r = validateSql(sql, allowed);
  assert.equal(r.valid, false);
});

test('rejects non-SELECT', () => {
  const r = validateSql(`INSERT INTO dataset_demo_sunita VALUES (1)`, allowed);
  assert.equal(r.valid, false);
});

test('rejects table outside whitelist', () => {
  const r = validateSql(`SELECT * FROM pg_catalog.pg_tables`, allowed);
  assert.equal(r.valid, false);
});

test('accepts simple whitelist SELECT', () => {
  const r = validateSql(`SELECT amount FROM dataset_demo_sunita LIMIT 5`, allowed);
  assert.equal(r.valid, true);
});
