'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemType: 'dataset' | 'chat';
  itemName: string;
  isLoading?: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  itemType,
  itemName,
  isLoading = false,
}: DeleteConfirmModalProps) {
  const isDataset = itemType === 'dataset';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Delete ${isDataset ? 'Dataset' : 'Conversation'}`}
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-red-500/20">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-300 mb-2">
              {isDataset
                ? `Delete dataset "${itemName}"?`
                : `Delete conversation "${itemName}"?`}
            </p>
            <p className="text-xs text-slate-400">
              {isDataset
                ? 'All conversations for this dataset will be permanently removed. This action cannot be undone.'
                : 'This conversation will be permanently removed. This action cannot be undone.'}
            </p>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
