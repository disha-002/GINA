import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { QueryResultPayload, QueryResultTable } from '../types/queryResultPayload.js';

/** Delay between simulated SSE `step` events (Phase 6). */
export const SIMULATED_STEP_DELAY_MS = 200;

const __dirname = dirname(fileURLToPath(import.meta.url));
/** `backend/snapshots` — valid for both `src/snapshots/*.ts` (dev) and `dist/snapshots/*.js` (prod). */
const SNAPSHOTS_DIR = join(__dirname, '..', '..', 'snapshots');

const chartDataSchema = z.union([
  z.object({
    labels: z.array(z.string()),
    datasets: z.array(
      z.object({ label: z.string(), data: z.array(z.number()) }),
    ),
  }),
  z.object({ value: z.number(), label: z.string() }),
]);

const resultTableSchema: z.ZodType<QueryResultTable> = z.object({
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  rows: z.array(z.record(z.string(), z.string())),
});

const snapshotOutputPayloadSchema = z.object({
  narrative: z.string(),
  chartType: z.enum(['bar', 'line', 'big_number', 'grouped_bar', 'stacked_bar', 'table']),
  chartData: chartDataSchema,
  keyFigure: z.string(),
  citationChips: z.array(z.string()),
  sql: z.string(),
  secondarySql: z.string().nullable(),
  rowCount: z.number(),
  confidenceScore: z.number(),
  followUpSuggestions: z.array(z.string()),
  autoInsights: z.array(z.string()),
  cacheHit: z.boolean().optional(),
  snapshotUsed: z.boolean().optional(),
  explanation: z.string().optional(),
  resultTable: resultTableSchema.nullable().optional(),
  resultTruncated: z.boolean().optional(),
  totalTimeMs: z.number().optional(),
});

const demoSnapshotFileSchema = z.object({
  matchQuestion: z.string(),
  datasetSlug: z.string(),
  outputPayload: snapshotOutputPayloadSchema,
  simulatedSteps: z.array(z.record(z.unknown())).optional(),
});

export type DemoSnapshot = {
  matchQuestion: string;
  datasetSlug: string;
  outputPayload: QueryResultPayload;
  simulatedSteps?: Record<string, unknown>[];
};

function toQueryResultPayload(
  raw: z.infer<typeof snapshotOutputPayloadSchema>,
): Omit<QueryResultPayload, 'messageId'> {
  return {
    narrative: raw.narrative,
    chartType: raw.chartType,
    chartData: raw.chartData,
    keyFigure: raw.keyFigure,
    citationChips: raw.citationChips,
    sql: raw.sql,
    secondarySql: raw.secondarySql,
    rowCount: raw.rowCount,
    confidenceScore: raw.confidenceScore,
    followUpSuggestions: raw.followUpSuggestions,
    autoInsights: raw.autoInsights,
    cacheHit: raw.cacheHit ?? false,
    snapshotUsed: raw.snapshotUsed ?? true,
    explanation: raw.explanation ?? '',
    resultTable: raw.resultTable ?? null,
    resultTruncated: raw.resultTruncated ?? false,
    totalTimeMs: raw.totalTimeMs ?? 0,
  };
}

/**
 * §8.2 — lowercase, trim, strip punctuation (non–letter/number → space), collapse spaces.
 * Used for both `matchQuestion` at load time and the live `question`.
 */
export function normaliseSnapshotQuestion(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function snapshotKey(datasetSlug: string, matchQuestion: string): string {
  return `${datasetSlug}::${normaliseSnapshotQuestion(matchQuestion)}`;
}

const snapshotsByKey = new Map<string, DemoSnapshot>();

/**
 * Load all `*.json` files from `backend/snapshots/`. Safe to call once at startup.
 */
export async function loadDemoSnapshots(log: {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
}): Promise<void> {
  snapshotsByKey.clear();

  let names: string[];
  try {
    names = await readdir(SNAPSHOTS_DIR);
  } catch (e) {
    log.warn({ err: e, dir: SNAPSHOTS_DIR }, 'Demo snapshots directory missing or unreadable');
    return;
  }

  const jsonFiles = names.filter((n) => n.endsWith('.json')).sort();
  for (const file of jsonFiles) {
    const path = join(SNAPSHOTS_DIR, file);
    let rawText: string;
    try {
      rawText = await readFile(path, 'utf8');
    } catch (e) {
      log.warn({ err: e, path }, 'Skip unreadable snapshot file');
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      log.warn({ err: e, path }, 'Skip invalid JSON snapshot');
      continue;
    }

    const result = demoSnapshotFileSchema.safeParse(parsed);
    if (!result.success) {
      log.warn({ path, issues: result.error.flatten() }, 'Skip snapshot with invalid shape');
      continue;
    }

    const data = result.data;
    const key = snapshotKey(data.datasetSlug, data.matchQuestion);
    if (snapshotsByKey.has(key)) {
      log.warn({ path, key }, 'Duplicate demo snapshot key; later file wins');
    }

    const base = toQueryResultPayload(data.outputPayload);
    const demo: DemoSnapshot = {
      matchQuestion: data.matchQuestion,
      datasetSlug: data.datasetSlug,
      outputPayload: { ...base, messageId: '' },
      simulatedSteps: data.simulatedSteps,
    };
    snapshotsByKey.set(key, demo);
  }

  log.info({ count: snapshotsByKey.size, dir: SNAPSHOTS_DIR }, 'Loaded demo snapshots');
}

/**
 * If `datasetSlug` matches the active demo dataset and the normalised question matches a snapshot, return it.
 */
export function findMatchingSnapshot(
  datasetSlug: string | null | undefined,
  question: string,
): DemoSnapshot | null {
  if (datasetSlug == null || datasetSlug === '') return null;
  const key = snapshotKey(datasetSlug, question);
  return snapshotsByKey.get(key) ?? null;
}

/** Default trace when `simulatedSteps` is omitted (Person A can override per file). */
export function defaultSimulatedSteps(rowCount: number): Record<string, unknown>[] {
  return [
    { step: 'planner', status: 'running', detail: 'Understanding your question…' },
    {
      step: 'planner',
      status: 'complete',
      detail: 'Identified intent and relevant columns',
    },
    {
      step: 'sql_generation',
      status: 'running',
      detail: 'Generating SQL query',
      sqlPath: 'groq_maverick',
    },
    {
      step: 'sql_generation',
      status: 'complete',
      detail: 'SQL ready',
      sqlPath: 'groq_maverick',
    },
    { step: 'db_execution', status: 'running', detail: 'Executing against your data' },
    {
      step: 'db_execution',
      status: 'complete',
      detail: 'Query finished',
      rowsReturned: rowCount,
    },
    { step: 'narration', status: 'running', detail: 'Writing your answer' },
    { step: 'narration', status: 'complete', detail: 'Done' },
  ];
}
