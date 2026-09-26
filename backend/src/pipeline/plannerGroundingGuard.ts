import type { PlannerOutput } from './planner.js';
import type { ColumnProfile } from '../semantic/profiler.js';

/** User-facing reply when the planner chose SQL but could not be grounded in the schema (no summary available). */
export const DEFAULT_NOT_GROUNDED_REPLY =
  "I wasn't able to match your question to specific columns in this sheet. Try rephrasing, or ask for a summary of what's here or sample rows.";

/**
 * When we have an understanding card, lead with what the data is about so we do not
 * contradict a helpful dataset summary with a failure line first.
 */
export function buildGroundingFallbackReply(understandingCard?: string | null): string {
  const hint = understandingCard?.trim();
  if (hint && hint.length > 0 && hint.length < 400) {
    return (
      `${hint}\n\n` +
      "I wasn't able to lock that question to exact column names in one step. Try again using words that appear in the column names or descriptions in the schema, or ask for a summary of the columns or a preview of the data."
    );
  }
  return DEFAULT_NOT_GROUNDED_REPLY;
}

export type GroundingGuardInput = {
  /** Physical table name for this dataset (e.g. dataset_abc). */
  tableName: string;
  /** Exact columnName values from ColumnProfile. */
  allowedColumnNames: ReadonlySet<string>;
  understandingCard?: string | null;
  /** Used to map planner hints (labels, casing) to real columnName values. */
  columnProfiles?: readonly ColumnProfile[];
};

function normKey(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Map a planner-produced column hint to a real columnName, or null if no safe match.
 */
export function resolvePlannerColumnHint(
  hint: string,
  allowedColumnNames: ReadonlySet<string>,
  profiles: readonly ColumnProfile[],
): string | null {
  const raw = hint.trim();
  if (!raw) return null;
  if (allowedColumnNames.has(raw)) return raw;

  const byLower = new Map<string, string>();
  for (const n of allowedColumnNames) {
    byLower.set(n.toLowerCase(), n);
  }
  const ci = byLower.get(raw.toLowerCase());
  if (ci) return ci;

  const underscored = raw.replace(/\s+/g, '_');
  if (allowedColumnNames.has(underscored)) return underscored;
  const ci2 = byLower.get(underscored.toLowerCase());
  if (ci2) return ci2;

  const spaced = raw.replace(/_/g, ' ');
  const ci3 = byLower.get(spaced.toLowerCase());
  if (ci3) return ci3;

  const nh = normKey(raw);
  if (nh.length < 2) return null;

  for (const c of profiles) {
    if (normKey(c.columnName) === nh) return c.columnName;
    if (normKey(c.businessLabel) === nh) return c.columnName;
  }

  for (const c of profiles) {
    const bl = normKey(c.businessLabel);
    const cn = normKey(c.columnName.replace(/_/g, ' '));
    if (nh.length >= 3 && (bl.includes(nh) || cn.includes(nh))) return c.columnName;
  }

  return null;
}

/**
 * If the planner returned SQL intents but relevant columns/tables are not grounded in the
 * actual schema, try to **repair** hints to real column names and the physical table name.
 * Only coerce to conversational when the question still cannot be tied to any real column
 * (likely off-topic or hallucinated columns).
 *
 * SQL generation already receives full `ColumnProfile[]`; this guard prevents obviously bad
 * SQL intents without blocking cases where the model used labels or wrong casing.
 */
export function applyPlannerGroundingGuard(
  plan: PlannerOutput,
  input: GroundingGuardInput,
): { plan: PlannerOutput; coerced: boolean } {
  if (plan.intent !== 'simple_query' && plan.intent !== 'complex_query') {
    return { plan, coerced: false };
  }

  const { tableName, allowedColumnNames, understandingCard, columnProfiles = [] } = input;

  let fixedTables = plan.relevantTables;
  if (fixedTables.length > 0 && !fixedTables.includes(tableName)) {
    fixedTables = [tableName];
  }

  if (plan.relevantColumns.length === 0) {
    return {
      plan: { ...plan, relevantTables: fixedTables },
      coerced: false,
    };
  }

  const resolved: string[] = [];
  for (const hint of plan.relevantColumns) {
    const name = resolvePlannerColumnHint(hint, allowedColumnNames, columnProfiles);
    if (name) resolved.push(name);
  }
  const deduped = [...new Set(resolved)];

  if (deduped.length === 0) {
    const reply =
      plan.conversationalReply?.trim() || buildGroundingFallbackReply(understandingCard);

    return {
      plan: {
        ...plan,
        intent: 'conversational',
        relevantColumns: [],
        relevantTables: [],
        answerFromCache: false,
        cacheAnswer: null,
        conversationalReply: reply,
      },
      coerced: true,
    };
  }

  return {
    plan: {
      ...plan,
      relevantColumns: deduped,
      relevantTables: fixedTables,
    },
    coerced: false,
  };
}
