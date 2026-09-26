'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
  itemType: 'dataset' | 'chat';
  isLoading?: boolean;
}

export function RenameModal({
  isOpen,
  onClose,
  onConfirm,
  currentName,
  itemType,
  isLoading = false,
}: RenameModalProps) {
  const [inputValue, setInputValue] = useState(currentName);

  useEffect(() => {
    if (isOpen) {
      setInputValue(currentName);
    }
  }, [isOpen, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setInputValue(currentName);
  };

  const handleClose = () => {
    setInputValue(currentName);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Rename ${itemType === 'dataset' ? 'Dataset' : 'Conversation'}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={itemType === 'dataset' ? 'Dataset name' : 'Conversation title'}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-indigo/50 focus:ring-1 focus:ring-brand-indigo/50 transition-all"
          autoFocus
          disabled={isLoading}
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-medium bg-brand-indigo text-white hover:bg-brand-indigo-light rounded-lg transition-colors disabled:opacity-50"
            disabled={isLoading || !inputValue.trim()}
          >
            {isLoading ? 'Saving...' : 'Rename'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
