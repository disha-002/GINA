'use client';

import React, { useMemo } from 'react';
import { StandardChartData } from '@/types';
import { formatChartAxisLabel, formatChartNumber } from '@/lib/charts/formatChartNumber';
import { maxCategoryLabelLength } from '@/lib/charts/chartDataUtils';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#006D6F', '#1D2B53', '#F5A623', '#008E90', '#2A3F7A', '#F7BC5A'];

export function BarChart({ data, isInline }: { data: StandardChartData; isInline?: boolean }) {
  const chartData = data.labels.map((label, index) => {
    const row: Record<string, unknown> = { name: label };
    data.datasets.forEach((dataset) => {
      row[dataset.label] = dataset.data[index];
    });
    return row;
  });

  const { containerHeightPx, yAxisWidth, barSize } = useMemo(() => {
    const n = data.labels.length;
    const maxLen = maxCategoryLabelLength(data.labels);
    const rowPx = isInline ? 22 : 34;
    const minH = isInline ? 200 : 320;
    const computed = Math.min(960, Math.max(minH, n * rowPx + 100));
    const yW = Math.min(360, Math.max(72, Math.ceil(maxLen * 6.8) + 16));
    const bs = n > 24 ? 14 : n > 16 ? 16 : isInline ? 12 : 20;
    return { containerHeightPx: computed, yAxisWidth: yW, barSize: bs };
  }, [data.labels, isInline]);

  return (
    <div
      className={`w-full ${isInline ? 'h-[200px] bg-transparent border-none p-1' : 'bg-surface-secondary border border-surface-border rounded-xl p-4'}`}
      style={isInline ? undefined : { height: containerHeightPx, minHeight: 320 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          layout="vertical"
          data={chartData}
          margin={
            isInline
              ? { top: 5, right: 10, left: 10, bottom: 5 }
              : { top: 8, right: 28, left: 8, bottom: 8 }
          }
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#2E3D5A" />
          <XAxis
            type="number"
            stroke="#94a3b8"
            fontSize={isInline ? 10 : 12}
            tickLine={false}
            tickFormatter={(v) => formatChartNumber(v)}
          />
          <YAxis
            dataKey="name"
            type="category"
            stroke="#94a3b8"
            fontSize={isInline ? 10 : 12}
            tickLine={false}
            width={yAxisWidth}
            tickFormatter={(v) => formatChartAxisLabel(v)}
            interval={0}
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
          {data.datasets.map((dataset, idx) => (
            <Bar
              key={dataset.label}
              dataKey={dataset.label}
              fill={COLORS[idx % COLORS.length]}
              radius={[0, 4, 4, 0]}
              barSize={barSize}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
