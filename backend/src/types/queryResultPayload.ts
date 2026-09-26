/** Primary SQL result grid for the client (Insight panel). */
export type QueryResultTable = {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string>>;
};

/** §9 OutputPayload / SSE `result` event (messages.output_payload JSONB). */
export type QueryResultPayload = {
  messageId: string;
  narrative: string;
  chartType: 'bar' | 'line' | 'big_number' | 'grouped_bar' | 'stacked_bar' | 'table';
  chartData:
    | {
        labels: string[];
        datasets: Array<{ label: string; data: number[] }>;
      }
    | { value: number; label: string };
  keyFigure: string;
  citationChips: string[];
  sql: string;
  secondarySql: string | null;
  rowCount: number;
  confidenceScore: number;
  followUpSuggestions: string[];
  autoInsights: string[];
  cacheHit: boolean;
  snapshotUsed: boolean;
  /** One-paragraph trace (SQL analytics path only). */
  explanation: string;
  /** Primary SELECT rows (stringified cells), same cap as db executor. */
  resultTable: QueryResultTable | null;
  /** True when the engine capped rows at MAX_ROWS. */
  resultTruncated: boolean;
  /** Wall-clock time from pipeline start until the result was ready (milliseconds). */
  totalTimeMs: number;
};
