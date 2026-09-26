'use client';

import React, { useMemo } from 'react';
import { StandardChartData } from '@/types';
import { formatChartAxisLabel, formatChartNumber } from '@/lib/charts/formatChartNumber';
import { chartLayoutForCategoryAxis } from '@/lib/charts/chartDataUtils';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const COLORS = ['#006D6F', '#1D2B53', '#F5A623', '#008E90', '#2A3F7A', '#F7BC5A'];

export function GroupedBarChart({ data, isInline }: { data: StandardChartData; isInline?: boolean }) {
  const chartData = data.labels.map((label, index) => {
    const row: Record<string, unknown> = { name: label };
    data.datasets.forEach((dataset) => {
      row[dataset.label] = dataset.data[index];
    });
    return row;
  });

  const layout = useMemo(() => chartLayoutForCategoryAxis(data.labels), [data.labels]);

  return (
    <div
      className={`w-full ${isInline ? 'h-[200px] bg-transparent border-none p-1' : 'bg-surface-secondary border border-surface-border rounded-xl p-4'}`}
      style={isInline ? undefined : { height: layout.chartHeightPx, minHeight: 320 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={chartData}
          margin={
            isInline
              ? { top: 5, right: 10, left: 10, bottom: 5 }
              : {
                  top: 8,
                  right: 28,
                  left: 20,
                  bottom: layout.bottomMargin + (data.datasets.length > 1 ? 8 : 0),
                }
          }
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2E3D5A" />
          <XAxis
            dataKey="name"
            stroke="#94a3b8"
            fontSize={isInline ? 10 : 12}
            tickLine={false}
            tickFormatter={(v) => formatChartAxisLabel(v)}
            angle={isInline ? 0 : layout.tiltLabels ? -26 : 0}
            textAnchor={isInline ? 'middle' : layout.tiltLabels ? 'end' : 'middle'}
            height={isInline ? 30 : layout.xAxisHeight}
            interval={
              isInline ? undefined : data.labels.length > 20 ? 'preserveStartEnd' : 0
            }
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={isInline ? 10 : 12}
            tickLine={false}
            tickFormatter={(v) => formatChartNumber(v)}
          />
          {!isInline && (
            <Tooltip
              formatter={(v) => formatChartNumber(v)}
              labelFormatter={(label) => formatChartAxisLabel(label)}
              cursor={{ fill: 'rgba(46, 61, 90, 0.4)' }}
              contentStyle={{
                backgroundColor: '#1A2235',
                borderColor: '#2E3D5A',
                color: '#E8EDF5',
                borderRadius: '8px',
              }}
              itemStyle={{ color: '#E8EDF5' }}
            />
          )}
          {!isInline && <Legend wrapperStyle={{ paddingTop: '12px' }} />}
          {data.datasets.map((dataset, idx) => (
            <Bar
              key={dataset.label}
              dataKey={dataset.label}
              fill={COLORS[idx % COLORS.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
