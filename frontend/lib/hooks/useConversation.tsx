'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Conversation, Message } from '@/types';
import {
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation as deleteConversationRequest,
} from '@/lib/api/conversations';
import { getMessages } from '@/lib/api/messages';
import { useDatasets } from './useDatasets';

interface ConversationContextType {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  setActiveConversation: (conversation: Conversation | string | null) => void;
  refreshConversations: () => Promise<void>;
  createNewConversation: (title?: string) => Promise<Conversation | null>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  removeConversation: (conversationId: string) => Promise<void>;
  messages: Message[];
  addMessage: (msg: Message) => void;
  isLoading: boolean;
  error: string | null;
  isNewlyCreatedConversation: boolean;
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

export function ConversationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { activeDataset } = useDatasets();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationState, setActiveConversationState] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newlyCreatedConversationId, setNewlyCreatedConversationId] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshConversations = useCallback(async () => {
    if (!activeDataset) {
      setConversations([]);
      setActiveConversationState(null);
      setMessages([]);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      const fetchedConversations = await listConversations(activeDataset.id);
      setConversations(fetchedConversations);
      
      // Keep active conversation only if it still exists for this dataset (no auto-pick of first)
      if (fetchedConversations.length > 0) {
        setActiveConversationState((current) => {
          if (current) {
            const match = fetchedConversations.find((c) => c.id === current.id);
            if (match) return match;
          }
          return null;
        });
      } else {
        setActiveConversationState(null);
        setMessages([]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load conversations';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [activeDataset]);

  // Initial fetch when activeDataset changes
  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const refreshMessages = useCallback(async () => {
    if (!activeConversationState) {
      setMessages([]);
      return;
    }

    try {
      const fetchedMessages = await getMessages(activeConversationState.id);
      setMessages(fetchedMessages);
    } catch (err: unknown) {
      console.error('Failed to load messages:', err);
    }
  }, [activeConversationState]);

  // Fetch messages when activeConversation changes
  useEffect(() => {
    refreshMessages();
  }, [refreshMessages]);

  const setActiveConversation = useCallback(
    (conversationOrId: Conversation | string | null) => {
      if (conversationOrId === null) {
        setActiveConversationState(null);
        setNewlyCreatedConversationId(null);
      } else if (typeof conversationOrId === 'string') {
        const found = conversations.find((c) => c.id === conversationOrId);
        if (found) {
          setActiveConversationState(found);
          // If navigating to an existing conversation (not newly created), clear the flag
          if (found.id !== newlyCreatedConversationId) {
            setNewlyCreatedConversationId(null);
          }
        } else if (conversationOrId === newlyCreatedConversationId) {
          // This is a newly created conversation that might not be in the list yet
          // Create a temporary placeholder conversation
          const placeholder: Conversation = {
            id: conversationOrId,
            datasetId: activeDataset?.id || '',
            userId: '',
            title: 'New Conversation',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setActiveConversationState(placeholder);
        } else {
          console.warn('Conversation not found:', conversationOrId);
        }
      } else {
        setActiveConversationState(conversationOrId);
        // If navigating to a conversation not in newly created list, clear flag
        if (conversationOrId.id !== newlyCreatedConversationId) {
          setNewlyCreatedConversationId(null);
        }
      }
    },
    [conversations, newlyCreatedConversationId, activeDataset]
  );
  
  const createNewConversation = useCallback(async (title?: string) => {
    if (!activeDataset) return null;
    setIsLoading(true);
    try {
        const newConv = await createConversation(activeDataset.id, title);
        setConversations(prev => [newConv, ...prev]);
        setActiveConversationState(newConv);
        setNewlyCreatedConversationId(newConv.id);
        return newConv;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create conversation';
        setError(message);
        return null;
    } finally {
        setIsLoading(false);
    }
  }, [activeDataset]);

  const renameConversation = useCallback(
    async (conversationId: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) {
        setError('Title cannot be empty');
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const updated = await updateConversation(conversationId, { title: trimmed });
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? updated : c)),
        );
        setActiveConversationState((current) =>
          current?.id === conversationId ? updated : current,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to rename conversation';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const removeConversation = useCallback(
    async (conversationId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        await deleteConversationRequest(conversationId);
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        let clearedActive = false;
        setActiveConversationState((current) => {
          if (current?.id === conversationId) {
            clearedActive = true;
            return null;
          }
          return current;
        });
        if (clearedActive) {
          router.push('/app');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete conversation';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        activeConversation: activeConversationState,
        setActiveConversation,
        refreshConversations,
        createNewConversation,
        renameConversation,
        removeConversation,
        messages,
        addMessage,
        isLoading,
        error,
        isNewlyCreatedConversation: activeConversationState?.id === newlyCreatedConversationId && messages.length === 0,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation(): ConversationContextType {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
}
