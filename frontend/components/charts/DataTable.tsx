'use client';

import React, { useState } from 'react';
import { StandardChartData } from '@/types';
import { formatChartAxisLabel, formatChartNumber } from '@/lib/charts/formatChartNumber';

function formatCell(v: unknown) {
  if (typeof v === 'number' && Number.isFinite(v)) return formatChartNumber(v);
  if (typeof v === 'string') return formatChartAxisLabel(v);
  return v as React.ReactNode;
}

export function DataTable({ data, isInline }: { data: StandardChartData; isInline?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const limit = isInline ? 5 : 10;
  
  const headers = ['Label', ...data.datasets.map(d => d.label)];
  
  const rows = data.labels.map((label, idx) => {
    return [label, ...data.datasets.map(d => d.data[idx])];
  });

  const displayRows = showAll ? rows : rows.slice(0, limit);
  const remaining = rows.length - limit;

  return (
    <div className="w-full border border-surface-border rounded-xl overflow-hidden bg-surface-secondary">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs text-slate-400 uppercase bg-surface border-b border-surface-border">
            <tr>
              {headers.map((header, i) => (
                <th key={i} scope="col" className="px-6 py-3 font-medium tracking-wider">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <tr key={i} className="border-b border-surface-border/50 hover:bg-surface/50 transition-colors last:border-b-0">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={
                      j === 0
                        ? 'px-6 py-3 align-top text-slate-200 whitespace-normal break-words max-w-[min(28rem,85vw)]'
                        : 'px-6 py-3 whitespace-nowrap'
                    }
                  >
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {!showAll && remaining > 0 && (
        <div className="p-3 text-center border-t border-surface-border">
          <button 
            onClick={() => setShowAll(true)}
            className="text-xs font-medium text-brand-teal hover:text-brand-teal-light"
          >
            Show {remaining} more rows
          </button>
        </div>
      )}
    </div>
  );
}
