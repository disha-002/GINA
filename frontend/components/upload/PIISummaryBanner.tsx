import React from 'react';
import { Shield } from 'lucide-react';
import type { PiiSummary } from '@/types';

interface PIISummaryBannerProps {
  summary: PiiSummary;
}

export default function PIISummaryBanner({ summary }: PIISummaryBannerProps) {
  const { redactedColumns, items, method } = summary;
  if (redactedColumns.length === 0) return null;

  const methodLabel = method === 'agent' ? 'AI-assisted scan' : 'Pattern-based scan';

  return (
    <div className="rounded-xl bg-[#613A1B]/30 border-t-2 border-t-[#E8A54F] border border-[#613A1B]/50 p-4 w-full">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-[#E8A54F] shrink-0 mt-0.5" fill="#E8A54F" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-white">
                We detected and redacted {redactedColumns.length} sensitive column
                {redactedColumns.length > 1 ? 's' : ''} from your dataset.
              </h4>
              <span
                className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-[#E8A54F]/40 text-[#E8A54F]/90"
                title="How columns were classified"
              >
                {methodLabel}
              </span>
            </div>
            {items.length > 0 && (
              <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
                {items.slice(0, 12).map((it, i) => (
                  <li key={`${it.columnKey}-${i}`} className="leading-snug">
                    <span className="text-slate-300 font-mono text-[11px]">{it.columnKey}</span>
                    {it.label ? (
                      <span className="text-slate-500"> · {it.label}</span>
                    ) : null}
                    <span className="text-slate-500"> — {it.reason}</span>
                  </li>
                ))}
                {items.length > 12 ? (
                  <li className="text-slate-500 italic">+{items.length - 12} more…</li>
                ) : null}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
