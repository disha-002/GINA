'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useConversation } from '@/lib/hooks/useConversation';
import { useDatasets } from '@/lib/hooks/useDatasets';
import { usePipeline } from '@/lib/hooks/usePipeline';
import { useReasoningToggle } from '@/lib/hooks/useReasoningToggle';
import { buildSessionContextFromMessages } from '@/lib/chat/sessionContext';
import { parseRateLimitError } from '@/lib/api/errors';
import { toFriendlyErrorMessage } from '@/lib/utils/errorMessages';
import { DatasetWorkspaceToolbar } from '@/components/app/DatasetWorkspaceToolbar';
import { CorrectionModal } from '@/components/upload/CorrectionModal';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { DatasetWelcome } from './DatasetWelcome';
import { DatasetWelcomeInput } from './DatasetWelcomeInput';
import { ConversationWelcome } from './ConversationWelcome';
import { RateLimitErrorPanel } from './RateLimitErrorPanel';
import type { StarterQuestionItem } from '@/types';
import { getStarterQuestions } from '@/lib/api/datasets';

const STATIC_STARTER_QUESTIONS: StarterQuestionItem[] = [
  { title: 'Overview', question: 'What is this dataset about at a high level?' },
  { title: 'Preview', question: 'Show me the first 15 rows so I can see what the data looks like.' },
  { title: 'Size', question: 'How many rows are in this dataset?' },
  { title: 'Structure', question: 'What columns does this dataset have and what do they represent?' },
];

export function ChatView() {
  const { activeDataset, refreshDatasets } = useDatasets();
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const { activeConversation, messages, addMessage, refreshConversations } = useConversation();
  const { steps, result, isStreaming, error, runQuery } = usePipeline();
  const { showReasoning } = useReasoningToggle();

  const rateLimitInfo = parseRateLimitError(error);

  const sessionContextForNextQuery = useMemo(
    () => buildSessionContextFromMessages(messages),
    [messages],
  );

  const canEditSemantic = !!activeDataset;

  const openCorrections = () => setCorrectionModalOpen(true);

  const lastAppendedResultKey = useRef<string | null>(null);

  const [starterQuestions, setStarterQuestions] = useState<StarterQuestionItem[] | undefined>(
    undefined,
  );

  const handleRetryAfterRateLimit = useCallback(async () => {
    // Retry the last query
    if (messages.length > 0 && activeConversation && activeDataset) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        await runQuery({
          conversationId: activeConversation.id,
          datasetId: activeConversation.datasetId,
          question: lastUserMsg.content,
          sessionContext: sessionContextForNextQuery,
        });
      }
    }
  }, [messages, activeConversation, activeDataset, runQuery, sessionContextForNextQuery]);

  useEffect(() => {
    if (!activeConversation || messages.length > 0) {
      setStarterQuestions(undefined);
      return;
    }
    let cancelled = false;
    setStarterQuestions(undefined);
    void getStarterQuestions(activeConversation.datasetId)
      .then((res) => {
        if (cancelled) return;
        const s = res.starters;
        setStarterQuestions(s && s.length > 0 ? s : STATIC_STARTER_QUESTIONS);
      })
      .catch(() => {
        if (!cancelled) setStarterQuestions(STATIC_STARTER_QUESTIONS);
      });
    return () => {
      cancelled = true;
    };
  }, [activeConversation, messages.length]);

  useEffect(() => {
    if (!isStreaming && result && activeConversation) {
      const key = `${activeConversation.id}:${result.messageId}`;
      if (lastAppendedResultKey.current === key) return;
      lastAppendedResultKey.current = key;
      addMessage({
        id: result.messageId,
        conversationId: activeConversation.id,
        role: 'assistant',
        content: result.narrative,
        outputPayload: result,
        createdAt: new Date().toISOString(),
      });
      void refreshConversations();
    }
  }, [isStreaming, result, activeConversation, addMessage, refreshConversations]);

  useEffect(() => {
    const handleAutoSubmit = async (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const question = customEvent.detail;
      if (!activeConversation || isStreaming) return;

      addMessage({
        id: `msg-${Date.now()}`,
        conversationId: activeConversation.id,
        role: 'user',
        content: question,
        createdAt: new Date().toISOString(),
      });

      await runQuery({
        conversationId: activeConversation.id,
        datasetId: activeConversation.datasetId,
        question,
        sessionContext: sessionContextForNextQuery,
      });
    };

    window.addEventListener('ttd:submit-chat', handleAutoSubmit as EventListener);
    return () => {
      window.removeEventListener('ttd:submit-chat', handleAutoSubmit as EventListener);
    };
  }, [activeConversation, isStreaming, sessionContextForNextQuery, runQuery, addMessage]);

  if (!activeDataset) {
    return (
      <div
        className="h-full flex items-center justify-center text-center text-slate-400 font-normal"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <p>Select a dataset to start chatting</p>
      </div>
    );
  }

  if (!activeConversation) {
    return (
      <div
        className="flex flex-col relative h-full bg-[#0F121A] font-normal"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <DatasetWorkspaceToolbar datasetName={activeDataset.name} />

        <div className="flex-1 overflow-y-auto pb-24">
          <div className="mx-auto w-full max-w-5xl px-6 pt-10">
            <div
              className="relative overflow-hidden rounded-3xl p-4 md:p-5"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'linear-gradient(180deg, rgba(15,18,26,0.94) 0%, rgba(12,16,24,0.76) 100%)',
                boxShadow: '0 18px 70px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              <div className="pointer-events-none absolute -top-24 left-20 h-56 w-56 rounded-full bg-brand-indigo/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 right-8 h-56 w-56 rounded-full bg-brand-teal/10 blur-3xl" />
              <DatasetWelcome dataset={activeDataset} />
              <DatasetWelcomeInput datasetId={activeDataset.id} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col relative h-full bg-[#0F121A] font-normal"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <DatasetWorkspaceToolbar datasetName={activeDataset.name} />

      <div className="flex-1 overflow-y-auto pb-32">
        {messages.length === 0 ? (
          <ConversationWelcome
            conversationId={activeConversation.id}
            datasetId={activeConversation.datasetId}
            starters={starterQuestions}
            loading={starterQuestions === undefined}
          />
        ) : (
          <MessageList>
            {messages.map((msg, idx) => (
              <div key={msg.id || idx} className="max-w-4xl mx-auto py-4 message-enter">
                {msg.role === 'user' ? (
                  <UserMessage text={msg.content} />
                ) : (
                  <AssistantMessage
                    message={msg}
                    steps={steps}
                    output={isStreaming && idx === messages.length - 1 ? result : msg.outputPayload}
                    isStreaming={isStreaming && idx === messages.length - 1}
                    showReasoning={showReasoning}
                    onCorrectionClick={canEditSemantic ? openCorrections : undefined}
                  />
                )}
              </div>
            ))}

            {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div className="max-w-4xl mx-auto py-4 message-enter">
                <AssistantMessage
                  message={{
                    id: 'streaming',
                    conversationId: activeConversation.id,
                    role: 'assistant',
                    content: 'Thinking...',
                    createdAt: new Date().toISOString(),
                  }}
                  steps={steps}
                  output={null}
                  isStreaming={true}
                  showReasoning={showReasoning}
                  onCorrectionClick={canEditSemantic ? openCorrections : undefined}
                />
              </div>
            )}

            {error && (
              <div className="max-w-4xl mx-auto px-4 py-3">
                {rateLimitInfo ? (
                  <RateLimitErrorPanel
                    retryAfterSeconds={rateLimitInfo.retryAfterSeconds}
                    onRetry={handleRetryAfterRateLimit}
                  />
                ) : (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/50 p-4 text-red-400 text-sm">
                    <p className="font-semibold mb-1">Hmm, I couldn&apos;t understand that</p>
                    <p>{toFriendlyErrorMessage(new Error(error))}</p>
                  </div>
                )}
              </div>
            )}
          </MessageList>
        )}
      </div>

      <ChatInput
        isStreaming={isStreaming}
        sessionContext={sessionContextForNextQuery}
        onSubmit={async (payload) => {
          addMessage({
            id: `msg-${Date.now()}`,
            conversationId: activeConversation.id,
            role: 'user',
            content: payload.question,
            createdAt: new Date().toISOString(),
          });

          await runQuery(payload);
        }}
      />

      {correctionModalOpen && activeDataset && (
        <CorrectionModal
          datasetId={activeDataset.id}
          onClose={() => setCorrectionModalOpen(false)}
          onSuccess={() => {
            setCorrectionModalOpen(false);
            void refreshDatasets();
          }}
        />
      )}
    </div>
  );
}
