'use client';

import React from 'react';
import type { ChartType, ChartData, StandardChartData, BigNumberChartData } from '@/types';
import { shouldPreferTableOverUniformBar } from '@/lib/charts/chartDataUtils';
import { BigNumberCard } from './BigNumberCard';
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { GroupedBarChart } from './GroupedBarChart';
import { StackedBarChart } from './StackedBarChart';
import { DataTable } from './DataTable';

interface ChartRendererProps {
  type: ChartType;
  data: ChartData;
  isInline?: boolean;
}

function isStandardChartData(data: ChartData): data is StandardChartData {
  return 'labels' in data && 'datasets' in data;
}

function countPlottedPointSlots(data: StandardChartData): number {
  const slotCount = Math.max(
    data.labels.length,
    ...data.datasets.map((dataset) => dataset.data.length),
  );

  let plottedSlots = 0;

  for (let index = 0; index < slotCount; index += 1) {
    const hasFiniteValueAtIndex = data.datasets.some((dataset) =>
      Number.isFinite(dataset.data[index]),
    );

    if (hasFiniteValueAtIndex) {
      plottedSlots += 1;
    }
  }

  return plottedSlots;
}

export function hasRenderableChart(type: ChartType, data: ChartData): boolean {
  if (type === 'big_number') {
    return true;
  }

  if (!isStandardChartData(data)) {
    return false;
  }

  const hasLabels = data.labels.length > 0;
  const hasDatasets = data.datasets.length > 0;
  const hasAnyValues = data.datasets.some((dataset) => dataset.data.length > 0);

  if (!hasLabels || !hasDatasets || !hasAnyValues) {
    return false;
  }

  // Table should render with at least one row-like value; for graphical charts require >1 point.
  if (type === 'table') {
    return true;
  }

  // Require at least two plotted x-axis slots; one slot is effectively a single datapoint chart.
  return countPlottedPointSlots(data) > 1;
}

export function renderChart(type: ChartType, data: ChartData, isInline?: boolean) {
  if (!hasRenderableChart(type, data)) {
    return null;
  }

  switch (type) {
    case 'big_number': {
      const d = data as unknown as BigNumberChartData;
      return <BigNumberCard label={d.label as string} value={d.value} isInline={isInline} />;
    }
    case 'bar': {
      const std = data as unknown as StandardChartData;
      if (shouldPreferTableOverUniformBar(std)) {
        return <DataTable data={std} isInline={isInline} />;
      }
      return <BarChart data={std} isInline={isInline} />;
    }
    case 'line': return <LineChart data={data as unknown as StandardChartData} isInline={isInline} />;
    case 'grouped_bar': {
      const std = data as unknown as StandardChartData;
      if (shouldPreferTableOverUniformBar(std)) {
        return <DataTable data={std} isInline={isInline} />;
      }
      return <GroupedBarChart data={std} isInline={isInline} />;
    }
    case 'stacked_bar': {
      const std = data as unknown as StandardChartData;
      if (shouldPreferTableOverUniformBar(std)) {
        return <DataTable data={std} isInline={isInline} />;
      }
      return <StackedBarChart data={std} isInline={isInline} />;
    }
    case 'table': return <DataTable data={data as unknown as StandardChartData} isInline={isInline} />;
    default: return <p className="text-slate-500 text-sm">Unsupported visualization: {type}</p>;
  }
}

export default function ChartRenderer({ type, data, isInline }: ChartRendererProps) {
  return renderChart(type, data, isInline);
}
