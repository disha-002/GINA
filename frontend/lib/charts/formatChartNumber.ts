/**
 * Human-readable values for chart axes and tooltips.
 * Avoids compact/scientific notation (e.g. 4.75e+4) from default Recharts formatting.
 */
export function formatChartNumber(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return String(value);
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return String(value);

  const abs = Math.abs(n);
  const opts: Intl.NumberFormatOptions = {
    useGrouping: true,
    notation: 'standard',
  };

  if (Number.isInteger(n) && abs < Number.MAX_SAFE_INTEGER) {
    opts.maximumFractionDigits = 0;
  } else if (abs !== 0 && abs < 0.0001) {
    opts.maximumFractionDigits = 6;
  } else {
    opts.maximumFractionDigits = 4;
    opts.minimumFractionDigits = 0;
  }

  return n.toLocaleString(undefined, opts);
}

/** Substrings that look like scientific notation (6.74e+4), including optional leading sign */
const SCIENTIFIC_NUMBER =
  /[+-]?(?:\d+\.?\d*|\d*\.?\d+)[eE][+-]?\d+/g;

/**
 * Formats axis labels and tooltip labels that are strings (e.g. bin ranges).
 * Replaces each scientific-notation token with a locale-formatted number so
 * "6.74e+4–8.72e+4" becomes "67,400 – 87,200" (dash preserved; en-dash normalized to spaced en-dash).
 */
export function formatChartAxisLabel(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  s = s.replace(SCIENTIFIC_NUMBER, (match) => {
    const n = Number(match);
    return Number.isNaN(n) ? match : formatChartNumber(n);
  });
  // Space around en/em dash when squeezed (e.g. "67,400–87,200")
  s = s.replace(/([^\s])([–—])([^\s])/g, '$1 $2 $3');
  // ASCII hyphen between two number-like tokens (e.g. "67,400-87,200")
  s = s.replace(/([0-9][0-9,]*)\s*-\s*([0-9][0-9,]*)/g, '$1 – $2');
  return s;
}
