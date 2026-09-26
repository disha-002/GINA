'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { ChatView } from '@/components/chat/ChatView';
import { useConversation } from '@/lib/hooks/useConversation';
import { useDatasets } from '@/lib/hooks/useDatasets';
import { listConversations } from '@/lib/api/conversations';

export default function ConversationPage() {
  const params = useParams();
  const conversationId = params.conversationId as string;
  const { setActiveConversation, conversations } = useConversation();
  const { activeDataset, datasets, setActiveDataset } = useDatasets();

  // Resolve conversation after messages list loads (needs conversations populated)
  useEffect(() => {
    if (!conversationId) return;
    
    setActiveConversation(conversationId);
  }, [conversationId, setActiveConversation, conversations]);

  // Deep link / refresh: find which dataset owns this conversation when none is active
  useEffect(() => {
    if (!conversationId || !datasets.length || activeDataset) return;

    let cancelled = false;
    (async () => {
      for (const d of datasets) {
        try {
          const convs = await listConversations(d.id);
          if (cancelled) return;
          if (convs.some((c) => c.id === conversationId)) {
            setActiveDataset(d);
            return;
          }
        } catch {
          // ignore per-dataset failures
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, datasets, activeDataset, setActiveDataset]);

  return <ChatView />;
}
