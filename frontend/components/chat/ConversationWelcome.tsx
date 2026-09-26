'use client';

import { MessageSquareText } from 'lucide-react';
import type { StarterQuestionItem } from '@/types';

interface ConversationWelcomeProps {
  conversationId: string;
  datasetId: string;
  /** Populated after GET /starter-questions; omitted while loading. */
  starters?: StarterQuestionItem[];
  loading?: boolean;
}

const FALLBACK_STARTERS: StarterQuestionItem[] = [
  { title: 'Overview', question: 'What is this dataset about at a high level?' },
  { title: 'Preview', question: 'Show me the first 15 rows so I can see what the data looks like.' },
  { title: 'Size', question: 'How many rows are in this dataset?' },
  { title: 'Structure', question: 'What columns does this dataset have and what do they represent?' },
];

function submitQuestion(question: string) {
  window.dispatchEvent(new CustomEvent('ttd:submit-chat', { detail: question }));
}

export function ConversationWelcome({
  conversationId,
  datasetId,
  starters,
  loading,
}: ConversationWelcomeProps) {
  const items = starters && starters.length > 0 ? starters : FALLBACK_STARTERS;

  return (
    <div
      className="max-w-4xl mx-auto px-6 py-14"
      data-conversation-id={conversationId}
      data-dataset-id={datasetId}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div
        className="rounded-2xl p-6"
        style={{
          background: 'linear-gradient(160deg, rgba(20,24,34,0.95) 0%, rgba(28,33,46,0.85) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cyan/15 border border-brand-cyan/35">
            <MessageSquareText className="h-5 w-5 text-brand-cyan" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">New Conversation</p>
            <p className="text-lg font-semibold text-white">Start by asking anything about your data</p>
          </div>
        </div>

        <p className="text-slate-300 text-sm font-normal mb-4">
          Use one of these prompts or write your own question below.
        </p>

        {loading ? (
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-9 w-40 rounded-lg bg-white/5 border border-white/10 animate-pulse"
                aria-hidden
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <button
                key={`${item.title}:${item.question}`}
                type="button"
                onClick={() => submitQuestion(item.question)}
                className="px-3 py-2 rounded-lg text-xs text-left text-slate-300 border border-white/10 bg-white/5 hover:bg-brand-indigo/15 hover:border-brand-indigo/40 hover:text-white transition-colors max-w-full"
                title={item.question}
              >
                <span className="block font-semibold text-brand-indigo-light/90 mb-0.5">{item.title}</span>
                <span className="text-slate-400 line-clamp-2">{item.question}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
