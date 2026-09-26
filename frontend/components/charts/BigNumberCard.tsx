import React from 'react';
import { formatChartAxisLabel, formatChartNumber } from '@/lib/charts/formatChartNumber';

function formatBigNumberDisplay(value: string | number): string {
  if (typeof value === 'number') return formatChartNumber(value);
  const t = value.trim();
  if (t === '') return value;
  // Ranges or scientific substrings — same rules as axis labels
  if (/[eE][+-]?\d/.test(t) || /[–—]/.test(t)) return formatChartAxisLabel(t);
  const n = Number(t.replace(/,/g, ''));
  if (!Number.isNaN(n) && /^[-+0-9.,eE\s]+$/.test(t)) return formatChartNumber(n);
  return formatChartAxisLabel(t);
}

export function BigNumberCard({ label, value, isInline }: { label?: string; value?: string | number; isInline?: boolean }) {
  if (value === undefined) return null;

  return (
    <div className={`flex flex-col items-center justify-center ${isInline ? 'p-2 min-h-[150px]' : 'p-8 min-h-[300px]'} ${isInline ? 'bg-transparent border-none' : 'bg-surface-secondary border border-surface-border rounded-xl'}`}>
      <span className={`${isInline ? 'text-4xl' : 'text-6xl'} font-bold text-brand-teal-light ${isInline ? 'mb-1' : 'mb-4'} text-center`}>
        {formatBigNumberDisplay(value)}
      </span>
      {label && (
        <span className={`${isInline ? 'text-xs' : 'text-sm'} font-medium text-slate-400 uppercase tracking-widest text-center`}>
          {label}
        </span>
      )}
    </div>
  );
}
