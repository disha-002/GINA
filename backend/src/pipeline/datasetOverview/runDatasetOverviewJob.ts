import type { FastifyInstance } from 'fastify';
import type { ColumnProfile } from '../../semantic/profiler.js';
import { computeDatasetStats } from './computeStats.js';
import { generateOverviewLayout } from './generateOverviewLayout.js';
import {
  assembleStoredOverview,
  buildExecutiveSummaryFallback,
  buildFallbackPlans,
  buildHighlightsFallback,
  type DatasetOverviewStored,
} from './overviewPayload.js';

type SchemaJson = {
  tableName: string;
  columns: ColumnProfile[];
  understandingCard?: string;
};

/**
 * Computes stats, optionally calls Gemini for layout, persists overview_json.
 * Safe to run in background; logs errors and sets overview_status failed on total failure.
 */
export async function runDatasetOverviewJob(fastify: FastifyInstance, datasetId: string): Promise<void> {
  const log = fastify.log.child({ job: 'datasetOverview', datasetId });

  try {
    const { rows } = await fastify.db.query<{
      schema_json: unknown;
      understanding_card: string | null;
    }>(
      `SELECT schema_json, understanding_card FROM semantic_states WHERE dataset_id = $1::uuid`,
      [datasetId],
    );
    if (rows.length === 0) {
      log.warn('semantic state missing; skip overview');
      return;
    }
    const raw = rows[0]!.schema_json as SchemaJson | null;
    if (!raw?.tableName || !Array.isArray(raw.columns)) {
      log.error('invalid schema_json');
      await markFailed(fastify, datasetId, 'Stored schema is invalid');
      return;
    }

    const understandingCard =
      raw.understandingCard ?? rows[0]!.understanding_card ?? '';

    const stats = await computeDatasetStats(fastify.db, raw.tableName, raw.columns);

    let executiveSummary: string;
    let highlights: string[];
    let chartPlans = buildFallbackPlans(stats);
    let model: string | undefined;

    try {
      const layout = await generateOverviewLayout(stats, understandingCard);
      executiveSummary = layout.executiveSummary;
      highlights = layout.highlights;
      model = layout.model;
      const merged =
        layout.chartPlans.length > 0 ? layout.chartPlans : buildFallbackPlans(stats);
      chartPlans = merged.length > 0 ? merged : buildFallbackPlans(stats);
    } catch (err) {
      log.warn({ err }, 'Gemini overview failed; using heuristic summary');
      executiveSummary = buildExecutiveSummaryFallback(stats, understandingCard);
      highlights = buildHighlightsFallback(stats);
      chartPlans = buildFallbackPlans(stats);
      model = undefined;
    }

    const stored: DatasetOverviewStored = assembleStoredOverview({
      stats,
      understandingCard,
      executiveSummary,
      highlights,
      chartPlans,
      model,
    });

    await fastify.db.query(
      `UPDATE semantic_states
       SET overview_status = 'ready',
           overview_json = $2::jsonb,
           overview_error = NULL,
           overview_model = $3,
           overview_generated_at = NOW()
       WHERE dataset_id = $1::uuid`,
      [datasetId, JSON.stringify(stored), model ?? null],
    );
    log.info('dataset overview ready');
  } catch (err) {
    log.error({ err }, 'dataset overview job failed');
    await markFailed(
      fastify,
      datasetId,
      err instanceof Error ? err.message : 'Overview generation failed',
    );
  }
}

async function markFailed(fastify: FastifyInstance, datasetId: string, message: string): Promise<void> {
  await fastify.db.query(
    `UPDATE semantic_states
     SET overview_status = 'failed',
         overview_error = $2,
         overview_generated_at = NOW()
     WHERE dataset_id = $1::uuid`,
    [datasetId, message.slice(0, 2000)],
  );
}

export function scheduleDatasetOverviewJob(fastify: FastifyInstance, datasetId: string): void {
  setImmediate(() => {
    void runDatasetOverviewJob(fastify, datasetId).catch((err) => {
      fastify.log.error({ err, datasetId }, 'scheduleDatasetOverviewJob: unhandled rejection');
    });
  });
}

export async function setOverviewPending(fastify: FastifyInstance, datasetId: string): Promise<void> {
  await fastify.db.query(
    `UPDATE semantic_states
     SET overview_status = 'pending',
         overview_error = NULL
     WHERE dataset_id = $1::uuid`,
    [datasetId],
  );
}
