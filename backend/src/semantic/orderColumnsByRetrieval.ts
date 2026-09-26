import type { ColumnProfile } from './profiler.js';

/** Minimal shape from `retrieveRelevantColumns` rows (distance ignored for ordering). */
export type RetrievedColumnRef = { columnName: string };

/**
 * Reorder full `ColumnProfile[]` so pgvector-retrieved columns (closest to the question) appear first,
 * then append remaining columns in their original order. Same multiset as `profiles` — safe for SQL
 * generation and planner grounding (no columns dropped).
 */
export function orderColumnProfilesByRetrieval(
  profiles: ColumnProfile[],
  retrieved: RetrievedColumnRef[],
): ColumnProfile[] {
  if (profiles.length === 0 || retrieved.length === 0) {
    return profiles;
  }
  const byName = new Map(profiles.map((c) => [c.columnName, c]));
  const seen = new Set<string>();
  const out: ColumnProfile[] = [];
  for (const r of retrieved) {
    const p = byName.get(r.columnName);
    if (p && !seen.has(p.columnName)) {
      out.push(p);
      seen.add(p.columnName);
    }
  }
  for (const c of profiles) {
    if (!seen.has(c.columnName)) {
      out.push(c);
      seen.add(c.columnName);
    }
  }
  return out;
}
