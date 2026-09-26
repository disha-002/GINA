'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/lib/providers/ToastProvider';

interface SQLExpandProps {
  sql: string;
  secondarySql?: string | null;
  rowsReturned?: number;
  /** One-paragraph transparency trace (SQL analytics path). */
  explanation?: string;
}

export function SQLExpand({ sql, secondarySql, rowsReturned, explanation }: SQLExpandProps) {
  const [expanded, setExpanded] = useState(false);
  const [copiedSql, setCopiedSql] = useState<'primary' | 'secondary' | null>(null);
  const { showToast } = useToast();

  const handleCopy = async (text: string, type: 'primary' | 'secondary') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSql(type);
      showToast(`${type === 'primary' ? 'Primary' : 'Secondary'} SQL copied to clipboard`, 'success', 2000);
      setTimeout(() => setCopiedSql(null), 2000);
    } catch {
      showToast('Failed to copy SQL', 'error');
    }
  };

  return (
    <div
      className="mb-4 flex flex-col overflow-hidden rounded-xl transition-all duration-200"
      style={{
        background: 'rgba(12,15,22,0.6)',
        border: expanded
          ? '1px solid rgba(60,224,214,0.20)'
          : '1px solid rgba(255,255,255,0.07)',
        boxShadow: expanded ? '-3px 0 0 0 rgba(60,224,214,0.4)' : 'none',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-4 py-3 transition-colors duration-150 hover:bg-white/3"
      >
        <div className="flex items-center gap-2.5">
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            style={{ color: expanded ? 'rgb(60,224,214)' : 'rgba(100,116,139,0.7)' }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span
            className="text-xs font-medium transition-colors duration-150"
            style={{ color: expanded ? 'rgb(148,163,184)' : 'rgba(100,116,139,0.8)' }}
          >
            See how this was calculated
          </span>
        </div>

        {rowsReturned !== undefined && (
          <span
            className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(60,224,214,0.08)',
              border: '1px solid rgba(60,224,214,0.18)',
              color: 'rgba(60,224,214,0.8)',
            }}
          >
            {rowsReturned} rows
          </span>
        )}
      </button>

      {expanded && (
        <div className="p-4 border-t border-surface-border bg-surface-secondary">
          {explanation?.trim() ? (
            <div className="mb-4 rounded-lg border border-white/[0.06] bg-[#0F121A]/80 px-3 py-2.5">
              <p className="text-[10px] font-bold tracking-wider text-slate-500 mb-1.5">IN SHORT</p>
              <p className="text-xs leading-relaxed text-slate-400">{explanation.trim()}</p>
            </div>
          ) : null}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold tracking-wider text-slate-500">PRIMARY SQL</span>
              <button
                onClick={() => handleCopy(sql, 'primary')}
                className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors rounded hover:bg-surface"
                aria-label="Copy primary SQL"
              >
                {copiedSql === 'primary' ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <pre className="text-xs text-slate-300 overflow-x-auto p-3 rounded-md bg-[#0F1623] border border-surface-border whitespace-pre-wrap">
              {sql}
            </pre>
          </div>
          {secondarySql && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold tracking-wider text-slate-500">SECONDARY SQL (VERIFICATION)</span>
                <button
                  onClick={() => handleCopy(secondarySql, 'secondary')}
                  className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors rounded hover:bg-surface"
                  aria-label="Copy secondary SQL"
                >
                  {copiedSql === 'secondary' ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <pre className="text-xs text-slate-300 overflow-x-auto p-3 rounded-md bg-[#0F1623] border border-surface-border whitespace-pre-wrap opacity-80">
                {secondarySql}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
