import type { StandardChartData } from '@/types';

/**
 * When every category has the same numeric value (e.g. all counts are 1), a bar chart
 * is visually flat and unhelpful — show a table instead.
 */
export function shouldPreferTableOverUniformBar(data: StandardChartData): boolean {
  if (data.labels.length < 2 || data.datasets.length === 0) return false;

  return data.datasets.every((ds) => {
    if (ds.data.length < data.labels.length) return false;
    const nums = data.labels.map((_, i) => {
      const v = ds.data[i];
      return typeof v === 'number' ? v : parseFloat(String(v));
    });
    if (nums.some((x) => !Number.isFinite(x))) return false;
    const first = nums[0]!;
    return nums.every((x) => Math.abs(x - first) < 1e-9);
  });
}

export function maxCategoryLabelLength(labels: string[]): number {
  if (labels.length === 0) return 1;
  return Math.max(1, ...labels.map((l) => String(l).length));
}

/** Extra bottom margin / chart height when X-axis category labels are long or crowded. */
export function chartLayoutForCategoryAxis(labels: string[]): {
  tiltLabels: boolean;
  bottomMargin: number;
  chartHeightPx: number;
  xAxisHeight: number;
} {
  const maxLen = maxCategoryLabelLength(labels);
  const n = labels.length;
  const tiltLabels = maxLen > 11 || n > 7;
  const bottomMargin = tiltLabels ? Math.min(120, 28 + Math.min(maxLen, 42) * 1.35) : 22;
  const chartHeightPx = Math.min(580, Math.max(320, 360 + (tiltLabels ? Math.min(140, maxLen * 1.8 + n * 2) : 0)));
  const xAxisHeight = tiltLabels ? Math.min(100, 36 + Math.min(maxLen, 36) * 1.2) : 28;
  return { tiltLabels, bottomMargin, chartHeightPx, xAxisHeight };
}
