'use client';

import React, { useMemo } from 'react';
import { StandardChartData } from '@/types';
import { formatChartAxisLabel, formatChartNumber } from '@/lib/charts/formatChartNumber';
import { chartLayoutForCategoryAxis } from '@/lib/charts/chartDataUtils';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#006D6F', '#1D2B53', '#F5A623', '#008E90', '#2A3F7A', '#F7BC5A'];

export function LineChart({ data, isInline }: { data: StandardChartData; isInline?: boolean }) {
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
        <RechartsLineChart
          data={chartData}
          margin={
            isInline
              ? { top: 5, right: 10, left: 10, bottom: 5 }
              : {
                  top: 8,
                  right: 28,
                  left: 20,
                  bottom: layout.bottomMargin,
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
              isInline ? undefined : data.labels.length > 28 ? 'preserveStartEnd' : 0
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
            <Line
              key={dataset.label}
              type="monotone"
              dataKey={dataset.label}
              stroke={COLORS[idx % COLORS.length]}
              strokeWidth={3}
              activeDot={{ r: 6 }}
              dot={{ r: 3, fill: '#0F1623' }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
