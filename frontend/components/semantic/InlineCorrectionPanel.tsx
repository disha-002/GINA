'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getSemanticState, patchSemanticState } from '@/lib/api/datasets';
import { buildSemanticCorrections } from '@/lib/semantic/corrections';
import type { SemanticState, ColumnProfile } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface InlineCorrectionPanelProps {
  datasetId: string;
  onClose: () => void;
  onSuccess?: (updatedState: SemanticState) => void;
}

export function InlineCorrectionPanel({ datasetId, onClose, onSuccess }: InlineCorrectionPanelProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [semanticState, setSemanticState] = useState<SemanticState | null>(null);
  const [columns, setColumns] = useState<ColumnProfile[]>([]);
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
      if (onSuccess) onSuccess(updatedState);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save corrections';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-6 border border-surface-border rounded-xl bg-surface-secondary shadow-lg overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-tertiary">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <span>🛠️</span> Semantic Corrections
        </h3>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 max-h-[300px] overflow-y-auto">
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-surface-border border-t-brand-teal animate-spin"></div>
          </div>
        ) : (
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-secondary uppercase text-[10px] text-slate-500 tracking-wider">
              <tr>
                <th className="px-3 py-2 border-b border-surface-border">Column</th>
                <th className="px-3 py-2 border-b border-surface-border">Label</th>
                <th className="px-3 py-2 border-b border-surface-border">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {columns.map((col, idx) => (
                <tr key={col.columnName} className="hover:bg-surface/50 transition-colors">
                  <td className="px-3 py-2 font-mono">{col.columnName}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="text"
                      value={col.businessLabel}
                      onChange={(e) => handleUpdate(idx, 'businessLabel', e.target.value)}
                      className="h-7 text-xs bg-surface"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={col.semanticType}
                      onChange={(e) => handleUpdate(idx, 'semanticType', e.target.value)}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1 focus:outline-none focus:border-brand-teal text-slate-200 text-xs"
                    >
                      <option value="text">Text</option>
                      <option value="amount">Amount</option>
                      <option value="category">Category</option>
                      <option value="date">Date</option>
                      <option value="identifier">Identifier</option>
                      <option value="flag">Flag</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="p-3 bg-surface-secondary border-t border-surface-border flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || loading}
          size="sm"
          className="bg-brand-teal hover:bg-brand-teal-light text-white font-medium"
        >
          {submitting ? 'Applying...' : 'Apply Correction'}
        </Button>
      </div>
    </div>
  );
}
