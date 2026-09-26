'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, Table2 } from 'lucide-react';
import { getDatasetPreview } from '@/lib/api/datasets';
import type { DatasetPreviewResponse } from '@/types';

const PAGE_SIZE = 50;

interface DatasetSheetPanelProps {
  open: boolean;
  onClose: () => void;
  datasetId: string;
  datasetName: string;
}

export function DatasetSheetPanel({
  open,
  onClose,
  datasetId,
  datasetName,
}: DatasetSheetPanelProps) {
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DatasetPreviewResponse | null>(null);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const res = await getDatasetPreview(datasetId, { limit: PAGE_SIZE, offset });
      setData(res);
      setLoadState('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dataset');
      setLoadState('error');
    }
  }, [datasetId, offset]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) {
      setOffset(0);
      setData(null);
      setLoadState('idle');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const total = data?.totalRows ?? 0;
  const rowCount = data?.rows.length ?? 0;
  const startRow = total === 0 ? 0 : offset + 1;
  const endRow = offset + rowCount;
  const canPrev = offset > 0;
  const canNext = data != null && endRow < total;

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        aria-label="Close dataset view"
        onClick={onClose}
      />
      <aside
        className="relative flex w-full max-w-[min(100vw,1200px)] flex-col border-l border-white/10 shadow-2xl animate-in slide-in-from-right duration-200"
        style={{
          background: 'linear-gradient(180deg, rgba(14,17,24,0.98), rgba(12,14,20,0.99))',
        }}
      >
        <header
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4"
          style={{ backdropFilter: 'blur(12px)' }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: 'linear-gradient(135deg, rgba(90,78,227,0.25), rgba(60,224,214,0.12))',
                border: '1px solid rgba(90,78,227,0.25)',
              }}
            >
              <Table2 className="h-4 w-4 text-brand-indigo-light" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-white">Dataset preview</h2>
              <p className="truncate text-xs text-slate-500">{datasetName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
          {loadState === 'loading' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-brand-indigo" />
              <p className="text-sm">Loading rows…</p>
            </div>
          )}

          {loadState === 'error' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-sm text-red-400/90">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10"
              >
                Retry
              </button>
            </div>
          )}

          {loadState === 'ready' && data && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {total === 0
                    ? 'No rows'
                    : `Rows ${startRow}–${endRow} of ${total.toLocaleString()}`}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!canPrev}
                    onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                    className="btn-press inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-slate-300 transition-colors enabled:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!canNext}
                    onClick={() => setOffset((o) => o + PAGE_SIZE)}
                    className="btn-press inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-slate-300 transition-colors enabled:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div
                className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/8"
                style={{ background: 'rgba(8,10,15,0.6)' }}
              >
                {data.columns.length === 0 ? (
                  <p className="p-6 text-center text-sm text-slate-500">No columns defined.</p>
                ) : (
                  <table className="w-max min-w-full border-collapse text-left text-xs">
                    <thead
                      className="sticky top-0 z-10"
                      style={{
                        background: 'rgba(18,22,32,0.95)',
                        boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
                      }}
                    >
                      <tr>
                        {data.columns.map((col) => (
                          <th
                            key={col.key}
                            className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-300"
                            title={col.key}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row, ri) => (
                        <tr
                          key={`${offset}-${ri}`}
                          className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                        >
                          {data.columns.map((col) => (
                            <td
                              key={col.key}
                              className="max-w-[min(28rem,40vw)] whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-snug text-slate-400"
                            >
                              {row[col.key] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
