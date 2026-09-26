'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Conversation } from '@/types';
import { listConversations } from '@/lib/api/conversations';

/**
 * Per-dataset conversation cache entry
 */
interface CacheEntry {
  conversations: Conversation[];
  timestamp: number;
}

/**
 * Global cache for conversations by datasetId
 * Shared across all useDatasetConversations instances
 */
const conversationCache = new Map<string, CacheEntry>();

/**
 * useDatasetConversations
 * 
 * Lazy-loads and caches conversations for a specific dataset.
 * Useful for sidebar tree nodes that need to independently load
 * chats without affecting the main conversation context.
 * 
 * Cache is global but errors/loading states are local to each hook instance.
 */
export function useDatasetConversations(datasetId: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial cache population from global store
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (!datasetId) return [];
    const cached = conversationCache.get(datasetId);
    return cached?.conversations || [];
  });

  const refresh = useCallback(async () => {
    if (!datasetId) {
      setConversations([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const convs = await listConversations(datasetId);
      setConversations(convs);
      
      // Update global cache
      conversationCache.set(datasetId, {
        conversations: convs,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load conversations';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [datasetId]);

  // Fetch on mount or when datasetId changes
  useEffect(() => {
    if (!datasetId) {
      setConversations([]);
      setError(null);
      return;
    }

    // Check cache first
    const cached = conversationCache.get(datasetId);
    if (cached) {
      setConversations(cached.conversations);
      setError(null);
      return;
    }

    // Not in cache, fetch
    void refresh();
  }, [datasetId, refresh]);

  return {
    conversations,
    isLoading,
    error,
    refresh,
  };
}

/**
 * Invalidate cache for a specific dataset
 * Call this after creating a new conversation or deleting a conversation
 */
export function invalidateDatasetConversationCache(datasetId: string) {
  conversationCache.delete(datasetId);
}

/**
 * Invalidate all conversation caches
 * Call this after uploading a new dataset or other major changes
 */
export function invalidateAllConversationCaches() {
  conversationCache.clear();
}
