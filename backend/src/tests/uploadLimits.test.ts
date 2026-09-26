import assert from 'node:assert';
import { test } from 'node:test';
import { MAX_CSV_UPLOAD_BYTES } from '../routes/datasets.js';

test('CSV upload cap is 50 MiB (Phase 7 large-file boundary)', () => {
  assert.equal(MAX_CSV_UPLOAD_BYTES, 50 * 1024 * 1024);
});
