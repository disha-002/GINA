'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Conversation, Dataset } from '@/types';

interface DeleteItem {
  type: 'dataset' | 'chat';
  item: Dataset | Conversation;
}

interface DeleteConfirmContextType {
  deleteItem: DeleteItem | null;
  showDeleteConfirm: (
    item: Dataset | Conversation,
    type: 'dataset' | 'chat',
    onConfirm?: () => Promise<void>,
  ) => void;
  hideDeleteConfirm: () => void;
  performDelete: () => Promise<void>;
  isDeleting: boolean;
}

const DeleteConfirmContext = createContext<DeleteConfirmContextType | undefined>(undefined);

export function DeleteConfirmProvider({ children }: { children: React.ReactNode }) {
  const [deleteItem, setDeleteItem] = useState<DeleteItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [onConfirmDelete, setOnConfirmDelete] = useState<(() => Promise<void>) | undefined>(undefined);

  const showDeleteConfirm = useCallback(
    (item: Dataset | Conversation, type: 'dataset' | 'chat', onConfirm?: () => Promise<void>) => {
      setDeleteItem({ type, item });
      if (onConfirm) {
        // Store function values via updater form so React does not invoke them as state updaters.
        setOnConfirmDelete(() => onConfirm);
      } else {
        setOnConfirmDelete(undefined);
      }
    },
    [],
  );

  const hideDeleteConfirm = useCallback(() => {
    setDeleteItem(null);
    setIsDeleting(false);
    setOnConfirmDelete(undefined);
  }, []);

  const performDelete = useCallback(async () => {
    if (!onConfirmDelete) return;
    setIsDeleting(true);
    try {
      await onConfirmDelete();
    } finally {
      setIsDeleting(false);
    }
  }, [onConfirmDelete]);

  return (
    <DeleteConfirmContext.Provider
      value={{
        deleteItem,
        showDeleteConfirm,
        hideDeleteConfirm,
        performDelete,
        isDeleting,
      }}
    >
      {children}
    </DeleteConfirmContext.Provider>
  );
}

export function useDeleteConfirm() {
  const context = useContext(DeleteConfirmContext);
  if (!context) {
    throw new Error('useDeleteConfirm must be used within DeleteConfirmProvider');
  }
  return context;
}
