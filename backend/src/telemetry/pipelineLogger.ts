/**
 * §5 Telemetry — Person A Phase 5.
 * Writes a row to `pipeline_runs` after every query orchestration completes.
 */
import type { Pool } from 'pg';
import type { PlannerIntent } from '../pipeline/planner.js';
import type { SqlGenerationPath } from '../pipeline/sqlGenerator.js';

export type PipelineRunInput = {
  conversationId: string;
  messageId: string | null;
  intent: PlannerIntent | null;
  latencyTotalMs: number;
  latencyPlannerMs: number | null;
  latencySqlMs: number | null;
  latencyDbMs: number | null;
  latencyNarratorMs: number | null;
  sqlPath: SqlGenerationPath | null;
  sqlValid: boolean | null;
  rowsReturned: number | null;
  /** 'response_cache' | 'narration_cache' | 'none' */
  cacheHit: 'response_cache' | 'narration_cache' | 'none';
  fallbackTriggered: boolean;
  fallbackStep: string | null;
  fallbackTarget: string | null;
  secondaryQueryFired: boolean;
  secondaryDimension: string | null;
  confidenceScore: number | null;
  snapshotUsed: boolean;
};

/**
 * Insert a single telemetry row.
 * Silently no-ops on write failure (telemetry must not break user-facing responses).
 */
export async function logPipelineRun(pool: Pool, data: PipelineRunInput): Promise<void> {
  await pool.query(
    `INSERT INTO pipeline_runs (
       conversation_id, message_id, intent,
       latency_total_ms, latency_planner_ms, latency_sql_ms,
       latency_db_ms, latency_narrator_ms,
       sql_path, sql_valid, rows_returned,
       cache_hit, fallback_triggered, fallback_step, fallback_target,
       secondary_query_fired, secondary_dimension,
       confidence_score, snapshot_used
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6,
       $7, $8,
       $9, $10, $11,
       $12, $13, $14, $15,
       $16, $17,
       $18, $19
     )`,
    [
      data.conversationId,
      data.messageId,
      data.intent,
      data.latencyTotalMs,
      data.latencyPlannerMs,
      data.latencySqlMs,
      data.latencyDbMs,
      data.latencyNarratorMs,
      data.sqlPath,
      data.sqlValid,
      data.rowsReturned,
      data.cacheHit,
      data.fallbackTriggered,
      data.fallbackStep,
      data.fallbackTarget,
      data.secondaryQueryFired,
      data.secondaryDimension,
      data.confidenceScore,
      data.snapshotUsed,
    ],
  );
}
