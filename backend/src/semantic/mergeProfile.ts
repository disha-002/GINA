import type { ColumnProfile as ProfilerColumnProfile } from './profiler.js';
import type { ColumnProfile as SemanticColumnProfile, ProfilerColumn } from './types.js';

export function profilerToEnricherInput(p: ProfilerColumnProfile): ProfilerColumn {
  return {
    columnName: p.columnName,
    sampleValues: p.sampleValues,
    nullPct: p.nullPct,
    uniqueCount: p.uniqueCount,
    valueRange: p.valueRange,
  };
}

/** Merge Groq enrichment into profiler output (keeps `postgresType` for DDL / coercion). */
export function applyEnrichment(
  base: ProfilerColumnProfile,
  enriched: SemanticColumnProfile,
): ProfilerColumnProfile {
  return {
    ...base,
    businessLabel: enriched.businessLabel,
    semanticType: enriched.semanticType,
    currency: enriched.currency ?? base.currency,
    description: enriched.description,
    sampleValues: enriched.sampleValues,
  };
}

export function mergeAllProfilerColumns(
  profiles: ProfilerColumnProfile[],
  enriched: SemanticColumnProfile[],
): ProfilerColumnProfile[] {
  const byName = new Map(enriched.map((e) => [e.columnName, e]));
  return profiles.map((p) => {
    const e = byName.get(p.columnName);
    if (!e) {
      throw new Error(`Enrichment missing column: ${p.columnName}`);
    }
    return applyEnrichment(p, e);
  });
}
