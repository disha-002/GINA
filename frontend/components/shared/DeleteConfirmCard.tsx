'use client';

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmCardProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  itemType: 'dataset' | 'chat';
  itemName: string;
  isLoading?: boolean;
}

export function DeleteConfirmCard({
  isOpen,
  onClose,
  onConfirm,
  itemType,
  itemName,
  isLoading = false,
}: DeleteConfirmCardProps) {
  if (!isOpen) return null;

  const isDataset = itemType === 'dataset';

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } catch (error) {
      throw error;
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-xl border border-red-500/30 bg-gradient-to-br from-red-950/20 to-red-900/10 p-6 shadow-2xl animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-lg bg-red-500/20">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Delete {isDataset ? 'Dataset' : 'Conversation'}
              </h3>
              <p className="text-sm text-slate-400 mt-1">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Message */}
        <div className="mb-6">
          <p className="text-sm text-slate-300">
            {isDataset
              ? `Are you sure you want to delete "${itemName}"? All conversations for this dataset will be permanently removed.`
              : `Are you sure you want to delete "${itemName}"? This conversation will be permanently removed.`}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-4 py-2.5 text-sm font-medium text-white bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
