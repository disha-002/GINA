import Papa from 'papaparse';

/**
 * Remove entire columns from a CSV string (headers + all row values).
 * Column names are matched case-sensitively against the parsed header row.
 * Unknown names in `columnsToDrop` are ignored.
 *
 * Used after PII shield marks columns so those columns never reach profiling / DB / planner.
 */
export function dropColumnsFromCsv(csv: string, columnsToDrop: string[]): string {
  if (columnsToDrop.length === 0) return csv;

  const toDrop = new Set(columnsToDrop);
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  const keep = headers.filter((h) => !toDrop.has(h));
  if (keep.length === headers.length) {
    return csv;
  }
  if (keep.length === 0) {
    return '';
  }

  const newRows = parsed.data.map((row) => {
    const out: Record<string, string> = {};
    for (const h of keep) {
      out[h] = row[h] ?? '';
    }
    return out;
  });

  return Papa.unparse(newRows);
}
