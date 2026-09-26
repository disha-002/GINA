'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getSemanticState, patchSemanticState } from '@/lib/api/datasets';
import { buildSemanticCorrections } from '@/lib/semantic/corrections';
import type { SemanticState, ColumnProfile } from '@/types';

interface CorrectionModalProps {
  datasetId: string;
  onClose: () => void;
  onSuccess: (updatedState: SemanticState) => void;
}

export function CorrectionModal({ datasetId, onClose, onSuccess }: CorrectionModalProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [semanticState, setSemanticState] = useState<SemanticState | null>(null);
  const [columns, setColumns] = useState<ColumnProfile[]>([]);
  /** Snapshot from GET — used to diff and build backend PATCH DTO */
  const initialColumnsRef = useRef<ColumnProfile[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const state = await getSemanticState(datasetId);
        setSemanticState(state);
        const cols = state.schemaJson.columns;
        setColumns(cols);
        initialColumnsRef.current = cols.map((c) => ({ ...c }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load semantic schema';
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [datasetId]);

  const handleUpdate = (idx: number, field: keyof ColumnProfile, value: string) => {
    const updated = [...columns];
    if (field === 'semanticType') {
      updated[idx] = {
        ...updated[idx],
        semanticType: value as ColumnProfile['semanticType'],
      };
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    setColumns(updated);
  };

  const handleSubmit = async () => {
    if (!semanticState) return;
    const corrections = buildSemanticCorrections(initialColumnsRef.current, columns);
    if (corrections.length === 0) {
      setError('No changes to save. Edit a column label or type first.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const updatedState = await patchSemanticState(datasetId, corrections);
      onSuccess(updatedState);
      onClose();
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : 'Failed to save corrections';
      if (
        message.includes('Dataset not found') ||
        message.includes('Semantic state not found')
      ) {
        message =
          'Cannot update this dataset. You may not own it, or it may no longer be available.';
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl bg-surface-secondary border border-surface-border rounded-2xl shadow-xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-surface-border">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Correct AI Understanding</h2>
            <p className="text-sm text-slate-400 mt-1">
              Help the AI understand your dataset better. Edit how columns should be interpreted.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
             <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
               {error}
             </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="w-8 h-8 rounded-full border-4 border-surface-border border-t-brand-teal animate-spin"></div>
            </div>
          ) : (
            <div className="border border-surface-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-surface uppercase text-xs text-slate-500 tracking-wider">
                  <tr>
                    <th className="px-4 py-3 border-b border-surface-border">Column Name</th>
                    <th className="px-4 py-3 border-b border-surface-border">Readable Label</th>
                    <th className="px-4 py-3 border-b border-surface-border">Semantic Type</th>
                    <th className="px-4 py-3 border-b border-surface-border">Example Values</th>
                  </tr>
                </thead>
                <tbody className="bg-surface-secondary divide-y divide-surface-border">
                  {columns.map((col, idx) => (
                    <tr key={col.columnName} className="hover:bg-surface/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{col.columnName}</td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={col.businessLabel}
                          onChange={(e) => handleUpdate(idx, 'businessLabel', e.target.value)}
                          className="w-full bg-surface border border-surface-border rounded-md px-3 py-1.5 focus:outline-none focus:border-brand-teal text-slate-200"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={col.semanticType}
                          onChange={(e) => handleUpdate(idx, 'semanticType', e.target.value)}
                          className="w-full bg-surface border border-surface-border rounded-md px-3 py-1.5 focus:outline-none focus:border-brand-teal text-slate-200"
                        >
                          <option value="text">Text</option>
                          <option value="amount">Amount</option>
                          <option value="category">Category</option>
                          <option value="date">Date</option>
                          <option value="identifier">Identifier</option>
                          <option value="flag">Flag</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 truncate max-w-[200px]">
                        {col.sampleValues?.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-surface-border flex justify-end gap-3 bg-surface-secondary rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface border border-surface-border text-slate-300 hover:text-white transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || loading}
            className="px-6 py-2 rounded-lg bg-brand-teal text-white shadow-lg shadow-brand-teal/20 text-sm font-medium hover:bg-brand-teal-light transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? 'Saving...' : 'Save Corrections'}
          </button>
        </div>

      </div>
    </div>
  );
}
