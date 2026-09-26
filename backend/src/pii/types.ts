/** One redacted column with optional human-readable explanation (agent or heuristic). */
export type PiiRedactionItem = {
  columnKey: string;
  reason: string;
  /** Same family as cell replacement tag, e.g. REDACTED_EMAIL */
  label?: string;
};

export type PiiMethod = 'agent' | 'fallback';

export type PiiSheetResult = {
  redactedCsv: string;
  redactedColumns: string[];
  totalRedactions: number;
  items: PiiRedactionItem[];
  method: PiiMethod;
};
