'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Dataset, Conversation } from '@/types';
import { useDatasets } from './useDatasets';
import { useConversation } from './useConversation';
import { useUploadModal } from './useUploadModal';
import { invalidateDatasetConversationCache, invalidateAllConversationCaches } from './useDatasetConversations';
import { listConversations } from '@/lib/api/conversations';
import { updateDataset, deleteDataset as deleteDatasetRequest } from '@/lib/api/datasets';

/**
 * SidebarViewModel
 * 
 * Composite hook that orchestrates all sidebar state and actions.
 * Combines useDatasets, useConversation, useUploadModal, and per-dataset
 * conversation caching with local expand/collapse state management.
 */
export interface SidebarViewModel {
  // Datasets
  datasets: Dataset[];
  activeDataset: Dataset | null;
  setActiveDataset: (dataset: Dataset) => void;
  datasetsLoading: boolean;
  datasetsError: string | null;
  refreshDatasets: () => Promise<void>;

  // Conversations (per-dataset caching)
  conversationsByDataset: Map<string, Conversation[]>;
  loadingDatasetIds: Set<string>;
  errorsByDataset: Map<string, string>;
  retryLoadDatasetConversations: (datasetId: string) => void;

  // Active Conversation
  activeConversation: Conversation | null;
  setActiveConversation: (conversation: Conversation) => void;

  // Actions
  createNewChat: (title?: string) => Promise<Conversation | null>;
  openUploadModal: () => void;
  renameChat: (conversation: Conversation, title: string) => Promise<void>;
  deleteChat: (conversation: Conversation) => Promise<void>;
  renameDataset: (dataset: Dataset, name: string) => Promise<void>;
  deleteDataset: (dataset: Dataset) => Promise<void>;

  // Local State (Expand/Collapse)
  expandedDatasetIds: Set<string>;
  toggleExpandDataset: (datasetId: string) => void;

  // Derived States
  isCreatingChat: boolean;
}

const EXPANDED_DATASETS_STORAGE_KEY = 'gina-expanded-datasets';

export function useSidebarViewModel(): SidebarViewModel {
  const { datasets, activeDataset, setActiveDataset, isLoading: datasetsLoading, error: datasetsError, refreshDatasets } = useDatasets();
  const {
    activeConversation,
    setActiveConversation,
    createNewConversation,
    isLoading: conversationCreating,
    renameConversation,
    removeConversation,
  } = useConversation();
  const { openUploadModal: openUploadModalContext } = useUploadModal();

  // Per-dataset conversation caching
  const [conversationsByDataset, setConvsByDataset] = useState<Map<string, Conversation[]>>(new Map());
  const [loadingDatasetIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [errorsByDataset, setErrorsByDataset] = useState<Map<string, string>>(new Map());

  // Expand/collapse state - persisted to sessionStorage
  const [expandedDatasetIds, setExpandedIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(EXPANDED_DATASETS_STORAGE_KEY);
        return new Set(saved ? JSON.parse(saved) : []);
      } catch (e) {
        console.warn('Failed to restore expanded datasets from storage:', e);
        return new Set();
      }
    }
    return new Set();
  });

  // Auto-expand active dataset when it changes
  useEffect(() => {
    if (activeDataset && !expandedDatasetIds.has(activeDataset.id)) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(activeDataset.id);
        return next;
      });
    }
  }, [activeDataset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load conversations for expanded datasets (lazy load on expand)
  useEffect(() => {
    const loadConversations = async () => {
      for (const datasetId of expandedDatasetIds) {
        // Skip if already loaded
        if (conversationsByDataset.has(datasetId)) {
          continue;
        }

        // Skip if already loading
        if (loadingDatasetIds.has(datasetId)) {
          continue;
        }

        // Mark as loading
        setLoadingIds((prev) => new Set([...prev, datasetId]));

        try {
          const convs = await listConversations(datasetId);
          setConvsByDataset((prev) => {
            const next = new Map(prev);
            next.set(datasetId, convs);
            return next;
          });
          setErrorsByDataset((prev) => {
            const next = new Map(prev);
            next.delete(datasetId);
            return next;
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to load conversations';
          setErrorsByDataset((prev) => new Map(prev).set(datasetId, message));
        } finally {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(datasetId);
            return next;
          });
        }
      }
    };

    void loadConversations();
  }, [expandedDatasetIds, conversationsByDataset, loadingDatasetIds]);

  const toggleExpandDataset = useCallback((datasetId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(datasetId)) {
        next.delete(datasetId);
      } else {
        next.add(datasetId);
      }
      // Persist to sessionStorage
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(EXPANDED_DATASETS_STORAGE_KEY, JSON.stringify([...next]));
        } catch (e) {
          console.warn('Failed to persist expanded datasets to storage:', e);
        }
      }
      return next;
    });
  }, []);

  const retryLoadDatasetConversations = useCallback(async (datasetId: string) => {
    setLoadingIds((prev) => new Set([...prev, datasetId]));
    setErrorsByDataset((prev) => {
      const next = new Map(prev);
      next.delete(datasetId);
      return next;
    });

    try {
      const convs = await listConversations(datasetId);
      setConvsByDataset((prev) => {
        const next = new Map(prev);
        next.set(datasetId, convs);
        return next;
      });
      setErrorsByDataset((prev) => {
        const next = new Map(prev);
        next.delete(datasetId);
        return next;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load conversations';
      setErrorsByDataset((prev) => new Map(prev).set(datasetId, message));
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(datasetId);
        return next;
      });
    }
  }, []);

  const createNewChat = useCallback(
    async (title?: string) => {
      const result = await createNewConversation(title);
      if (result && activeDataset) {
        // Invalidate cache for active dataset so it reloads
        invalidateDatasetConversationCache(activeDataset.id);
        setConvsByDataset((prev) => {
          const next = new Map(prev);
          next.delete(activeDataset.id);
          return next;
        });
        // Reload if dataset is expanded
        if (expandedDatasetIds.has(activeDataset.id)) {
          await retryLoadDatasetConversations(activeDataset.id);
        }
      }
      return result;
    },
    [createNewConversation, activeDataset, expandedDatasetIds, retryLoadDatasetConversations]
  );

  const handleOpenUploadModal = useCallback(() => {
    openUploadModalContext();
  }, [openUploadModalContext]);

  const renameChat = useCallback(
    async (conversation: Conversation, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      await renameConversation(conversation.id, trimmed);
      invalidateDatasetConversationCache(conversation.datasetId);
      setConvsByDataset((prev) => {
        const next = new Map(prev);
        const list = next.get(conversation.datasetId);
        if (!list) return prev;
        next.set(
          conversation.datasetId,
          list.map((c) =>
            c.id === conversation.id
              ? { ...c, title: trimmed, updatedAt: new Date().toISOString() }
              : c,
          ),
        );
        return next;
      });
    },
    [renameConversation],
  );

  const deleteChat = useCallback(
    async (conversation: Conversation) => {
      await removeConversation(conversation.id);
      invalidateDatasetConversationCache(conversation.datasetId);
      setConvsByDataset((prev) => {
        const next = new Map(prev);
        const list = next.get(conversation.datasetId);
        if (list) {
          next.set(
            conversation.datasetId,
            list.filter((c) => c.id !== conversation.id),
          );
        }
        return next;
      });
    },
    [removeConversation],
  );

  const renameDataset = useCallback(
    async (dataset: Dataset, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await updateDataset(dataset.id, { name: trimmed });
      await refreshDatasets();
    },
    [refreshDatasets],
  );

  const deleteDataset = useCallback(
    async (dataset: Dataset) => {
      await deleteDatasetRequest(dataset.id);
      invalidateAllConversationCaches();
      setConvsByDataset((prev) => {
        const next = new Map(prev);
        next.delete(dataset.id);
        return next;
      });
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(dataset.id);
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(EXPANDED_DATASETS_STORAGE_KEY, JSON.stringify([...next]));
          } catch {
            /* ignore */
          }
        }
        return next;
      });
      await refreshDatasets();
    },
    [refreshDatasets],
  );

  return {
    // Datasets
    datasets,
    activeDataset,
    setActiveDataset,
    datasetsLoading,
    datasetsError,
    refreshDatasets,

    // Conversations (per-dataset)
    conversationsByDataset,
    loadingDatasetIds,
    errorsByDataset,
    retryLoadDatasetConversations,

    // Active conversation
    activeConversation,
    setActiveConversation,

    // Actions
    createNewChat,
    openUploadModal: handleOpenUploadModal,
    renameChat,
    deleteChat,
    renameDataset,
    deleteDataset,

    // Expand/collapse
    expandedDatasetIds,
    toggleExpandDataset,

    // Derived
    isCreatingChat: conversationCreating,
  };
}
