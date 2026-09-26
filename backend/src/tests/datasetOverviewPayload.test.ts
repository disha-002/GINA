import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleStoredOverview,
  buildFallbackPlans,
  materializeCharts,
} from '../pipeline/datasetOverview/overviewPayload.js';
import type { DatasetStats } from '../pipeline/datasetOverview/computeStats.js';

const minimalStats: DatasetStats = {
  tableName: 'dataset_abcd',
  rowCount: 100,
  columns: [
    {
      columnName: 'amount',
      semanticType: 'amount',
      postgresType: 'NUMERIC',
      nullPct: 0,
      uniqueCount: 50,
      numeric: {
        min: 0,
        max: 500,
        mean: 100,
        nonNullCount: 100,
        histogram: [
          { binIndex: 1, count: 40, lo: 0, hi: 62.5 },
          { binIndex: 2, count: 60, lo: 62.5, hi: 125 },
        ],
      },
    },
    {
      columnName: 'region',
      semanticType: 'category',
      postgresType: 'TEXT',
      nullPct: 0,
      uniqueCount: 3,
      topValues: [
        { value: 'North', count: 50 },
        { value: 'South', count: 50 },
      ],
    },
  ],
};

test('buildFallbackPlans includes row count and column charts', () => {
  const plans = buildFallbackPlans(minimalStats);
  assert.ok(plans.some((p) => p.kind === 'row_count_big_number'));
  assert.ok(plans.some((p) => p.columnName === 'amount'));
});

test('materializeCharts produces bar and big_number', () => {
  const plans = buildFallbackPlans(minimalStats);
  const charts = materializeCharts(minimalStats, plans);
  assert.ok(charts.length >= 2);
  assert.ok(charts.some((c) => c.chartType === 'big_number'));
  assert.ok(charts.some((c) => c.chartType === 'bar'));
});

test('assembleStoredOverview validates version 1', () => {
  const stored = assembleStoredOverview({
    stats: minimalStats,
    understandingCard: 'Test sheet.',
    executiveSummary: 'Summary.',
    highlights: ['a'],
    chartPlans: buildFallbackPlans(minimalStats),
  });
  assert.equal(stored.version, 1);
  assert.equal(stored.executiveSummary, 'Summary.');
  assert.ok(stored.charts.length > 0);
});
