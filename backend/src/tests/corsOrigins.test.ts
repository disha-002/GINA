import assert from 'node:assert';
import { test } from 'node:test';
import { buildCorsAllowedOrigins } from '../config/corsOrigins.js';

test('buildCorsAllowedOrigins merges defaults and env CSV', () => {
  const s = buildCorsAllowedOrigins('https://app.vercel.app, https://preview.vercel.app ');
  assert.ok(s.has('http://localhost:3000'));
  assert.ok(s.has('https://app.vercel.app'));
  assert.ok(s.has('https://preview.vercel.app'));
});
