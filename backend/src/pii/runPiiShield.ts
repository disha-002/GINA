import { env } from '../config/env.js';
import { dropColumnsFromCsv } from './dropRedactedColumns.js';
import { runShieldAgentCsv, withTimeout } from './shieldAgent.js';
import { runShieldFallbackCsv } from './shieldFallback.js';
import type { PiiSheetResult } from './types.js';

function withPiiColumnsDroppedFromCsv(result: PiiSheetResult): PiiSheetResult {
  if (result.redactedColumns.length === 0) {
    return result;
  }
  return {
    ...result,
    redactedCsv: dropColumnsFromCsv(result.redactedCsv, result.redactedColumns),
  };
}

/**
 * Run PII agent (Groq) with timeout, then fall back to deterministic heuristics if disabled or on failure.
 * Flagged columns are removed from the CSV entirely (not stored or exposed to the pipeline).
 */
export async function runPiiForSheet(
  csv: string,
  sheetLabel: string,
  columnKeyPrefix: string,
): Promise<PiiSheetResult> {
  if (!env.PII_AGENT_DISABLED) {
    const agentResult = await withTimeout(
      runShieldAgentCsv(csv, sheetLabel, columnKeyPrefix),
      env.PII_AGENT_TIMEOUT_MS,
    );
    if (agentResult) {
      return withPiiColumnsDroppedFromCsv(agentResult);
    }
  }

  return withPiiColumnsDroppedFromCsv(runShieldFallbackCsv(csv, columnKeyPrefix));
}
