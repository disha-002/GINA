import assert from 'node:assert';
import { test } from 'node:test';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  getResponseCache,
  responseCacheKey,
  storeResponseCache,
} from '../cache/responseCache.js';
import type { QueryResultPayload } from '../types/queryResultPayload.js';

const hasDb = !!process.env.DATABASE_URL;

const samplePayload = (narrative: string): QueryResultPayload => ({
  messageId: randomUUID(),
  narrative,
  chartType: 'table',
  chartData: { labels: [], datasets: [] },
  keyFigure: '0',
  citationChips: [],
  sql: 'SELECT 1',
  secondarySql: null,
  rowCount: 0,
  confidenceScore: 1,
  followUpSuggestions: [],
  autoInsights: [],
  cacheHit: false,
  snapshotUsed: false,
  explanation: '',
  resultTable: null,
  resultTruncated: false,
  totalTimeMs: 0,
});

(hasDb ? test : test.skip)('concurrent response_cache upserts do not throw', async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const datasetId = randomUUID();
  const question = `concurrent test ${randomUUID()}`;
  const concurrency = 40;

  try {
    await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        storeResponseCache(pool, datasetId, question, samplePayload(`v${i}`)),
      ),
    );
    const got = await getResponseCache(pool, datasetId, question);
    assert.ok(got?.payload);
    assert.ok(typeof got.payload.narrative === 'string');
  } finally {
    await pool
      .query('DELETE FROM response_cache WHERE cache_key = $1', [responseCacheKey(datasetId, question)])
      .catch(() => {});
    await pool.end();
  }
});
