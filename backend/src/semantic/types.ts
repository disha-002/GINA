/** Profiler output passed into the enricher (Person A / profiler). */
export interface ProfilerColumn {
  columnName: string;
  sampleValues: string[];
  nullPct: number;
  uniqueCount: number;
  valueRange: { min: string; max: string } | null;
}

/** Full column profile stored in `semantic_states.schema_json` (see Backend_Master §5.1). */
export interface ColumnProfile {
  columnName: string;
  businessLabel: string;
  semanticType: 'amount' | 'date' | 'category' | 'identifier' | 'flag' | 'text';
  currency: 'GBP' | 'USD' | 'EUR' | null;
  description: string;
  sampleValues: string[];
  nullPct: number;
  uniqueCount: number;
  valueRange: { min: string; max: string } | null;
}
