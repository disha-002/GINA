import { z } from 'zod';
import type { DatasetStats, ColumnStatEntry } from './computeStats.js';

const chartTypeSchema = z.enum(['bar', 'big_number', 'table']);

const standardChartDataSchema = z.object({
  labels: z.array(z.string()),
  datasets: z.array(
    z.object({
      label: z.string(),
      data: z.array(z.number()),
      backgroundColor: z.string().optional(),
      borderColor: z.string().optional(),
    }),
  ),
});

const bigNumberChartDataSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
});

export const overviewChartItemSchema = z.object({
  title: z.string().max(300),
  insight: z.string().max(600).optional(),
  chartType: chartTypeSchema,
  chartData: z.union([standardChartDataSchema, bigNumberChartDataSchema]),
});

export type OverviewChartItem = z.infer<typeof overviewChartItemSchema>;

export const datasetOverviewStoredSchema = z.object({
  version: z.literal(1),
  executiveSummary: z.string().max(8000),
  highlights: z.array(z.string()).max(16),
  charts: z.array(overviewChartItemSchema).max(16),
  statsHeadline: z
    .object({
      rowCount: z.number(),
      columnCount: z.number(),
    })
    .optional(),
});

export type DatasetOverviewStored = z.infer<typeof datasetOverviewStoredSchema>;

export type ChartPlan = {
  kind: 'numeric_histogram' | 'top_values' | 'date_span' | 'row_count_big_number';
  columnName: string | null;
  title: string;
  insight?: string;
};

const MAX_FALLBACK_CHARTS = 12;

function colMap(stats: DatasetStats): Map<string, ColumnStatEntry> {
  return new Map(stats.columns.map((c) => [c.columnName, c]));
}

function barFromHistogram(col: ColumnStatEntry, title: string, insight?: string): OverviewChartItem {
  const h = col.numeric?.histogram ?? [];
  const labels = h.map((b) =>
    h.length <= 1 ? 'All' : `${b.lo.toPrecision(3)}–${b.hi.toPrecision(3)}`,
  );
  const data = h.map((b) => b.count);
  return {
    title,
    insight,
    chartType: 'bar',
    chartData: {
      labels: labels.length > 0 ? labels : ['(no spread)'],
      datasets: [{ label: 'Rows', data: data.length > 0 ? data : [0] }],
    },
  };
}

function barFromTopValues(col: ColumnStatEntry, title: string, insight?: string): OverviewChartItem {
  const tv = col.topValues ?? [];
  const labels = tv.map((t) => (t.value.length > 40 ? `${t.value.slice(0, 37)}…` : t.value));
  const data = tv.map((t) => t.count);
  return {
    title,
    insight,
    chartType: 'bar',
    chartData: {
      labels: labels.length > 0 ? labels : ['(empty)'],
      datasets: [{ label: 'Count', data: data.length > 0 ? data : [0] }],
    },
  };
}

function bigNumberRowCount(stats: DatasetStats, title: string, insight?: string): OverviewChartItem {
  return {
    title,
    insight,
    chartType: 'big_number',
    chartData: { label: 'Rows', value: stats.rowCount },
  };
}

function dateRangeBar(col: ColumnStatEntry, title: string, insight?: string): OverviewChartItem {
  const d = col.date;
  if (!d) {
    return barFromTopValues(
      { ...col, topValues: [{ value: 'n/a', count: 0 }] },
      title,
      insight,
    );
  }
  return {
    title,
    insight,
    chartType: 'bar',
    chartData: {
      labels: [d.min, d.max],
      datasets: [{ label: 'Coverage', data: [1, 1] }],
    },
  };
}

/**
 * Heuristic fallback when Gemini fails: diverse chart mix from stats.
 */
export function buildFallbackPlans(stats: DatasetStats): ChartPlan[] {
  const plans: ChartPlan[] = [];
  plans.push({
    kind: 'row_count_big_number',
    columnName: null,
    title: 'Dataset size',
    insight: 'Total rows loaded for this dataset.',
  });

  const numericCols = stats.columns.filter((c) => c.numeric && (c.numeric.histogram?.length ?? 0) > 0);
  const catCols = stats.columns.filter((c) => (c.topValues?.length ?? 0) > 0);
  const dateCols = stats.columns.filter((c) => c.date);

  for (const c of numericCols.slice(0, 4)) {
    plans.push({
      kind: 'numeric_histogram',
      columnName: c.columnName,
      title: `Distribution: ${c.columnName}`,
    });
  }
  for (const c of catCols.slice(0, 4)) {
    plans.push({
      kind: 'top_values',
      columnName: c.columnName,
      title: `Top values: ${c.columnName}`,
    });
  }
  for (const c of dateCols.slice(0, 2)) {
    plans.push({
      kind: 'date_span',
      columnName: c.columnName,
      title: `Date span: ${c.columnName}`,
    });
  }

  return plans.slice(0, MAX_FALLBACK_CHARTS);
}

function planToChart(stats: DatasetStats, plan: ChartPlan, cmap: Map<string, ColumnStatEntry>): OverviewChartItem | null {
  if (plan.kind === 'row_count_big_number') {
    return bigNumberRowCount(stats, plan.title, plan.insight);
  }
  const name = plan.columnName;
  if (!name) return null;
  const col = cmap.get(name);
  if (!col) return null;

  if (plan.kind === 'date_span') {
    if (col.postgresType === 'DATE' && col.date) {
      return dateRangeBar(col, plan.title, plan.insight);
    }
    return null;
  }
  if (plan.kind === 'numeric_histogram') {
    if (col.numeric && (col.numeric.histogram?.length ?? 0) > 0) {
      return barFromHistogram(col, plan.title, plan.insight);
    }
    return null;
  }
  if (plan.kind === 'top_values') {
    if ((col.topValues?.length ?? 0) > 0) {
      return barFromTopValues(col, plan.title, plan.insight);
    }
    return null;
  }
  return null;
}

export function buildExecutiveSummaryFallback(stats: DatasetStats, understandingCard: string): string {
  const uc = understandingCard.trim();
  const first = uc.length > 0 ? `${uc} ` : '';
  return `${first}The sheet has ${stats.rowCount.toLocaleString()} rows and ${stats.columns.length} columns. Use the charts below to spot distributions and common categories.`;
}

export function buildHighlightsFallback(stats: DatasetStats): string[] {
  const h: string[] = [];
  const numeric = stats.columns.find((c) => c.numeric);
  const cat = stats.columns.find((c) => (c.topValues?.length ?? 0) > 0);
  const dt = stats.columns.find((c) => c.date);
  if (numeric) {
    h.push(
      `Numeric column "${numeric.columnName}" ranges from ${numeric.numeric?.min} to ${numeric.numeric?.max}.`,
    );
  }
  if (cat?.topValues?.[0]) {
    h.push(
      `Most common value in "${cat.columnName}": "${cat.topValues[0].value}" (${cat.topValues[0].count} rows).`,
    );
  }
  if (dt?.date) {
    h.push(`Dates in "${dt.columnName}" run from ${dt.date.min} to ${dt.date.max}.`);
  }
  if (h.length === 0) {
    h.push(`Row count: ${stats.rowCount}.`);
  }
  return h.slice(0, 6);
}

/**
 * Turn validated plans into render-ready charts; drops invalid plans.
 */
export function materializeCharts(stats: DatasetStats, plans: ChartPlan[]): OverviewChartItem[] {
  const cmap = colMap(stats);
  const out: OverviewChartItem[] = [];
  for (const p of plans) {
    const ch = planToChart(stats, p, cmap);
    if (ch) out.push(ch);
  }
  return out.slice(0, MAX_FALLBACK_CHARTS);
}

export function assembleStoredOverview(input: {
  stats: DatasetStats;
  understandingCard: string;
  executiveSummary: string;
  highlights: string[];
  chartPlans: ChartPlan[];
  model?: string;
}): DatasetOverviewStored {
  const charts = materializeCharts(input.stats, input.chartPlans);
  const fallbackCharts =
    charts.length > 0 ? charts : materializeCharts(input.stats, buildFallbackPlans(input.stats));

  return datasetOverviewStoredSchema.parse({
    version: 1 as const,
    executiveSummary: input.executiveSummary.trim() || buildExecutiveSummaryFallback(input.stats, input.understandingCard),
    highlights:
      input.highlights.length > 0 ? input.highlights : buildHighlightsFallback(input.stats),
    charts: fallbackCharts.length > 0 ? fallbackCharts : [],
    statsHeadline: {
      rowCount: input.stats.rowCount,
      columnCount: input.stats.columns.length,
    },
  });
}
