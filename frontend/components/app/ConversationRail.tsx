'use client';

import React from 'react';
import { useDatasets } from '@/lib/hooks/useDatasets';
import { useConversation } from '@/lib/hooks/useConversation';
import ConversationItem from '@/components/sidebar/ConversationItem';
import NewConversationBtn from '@/components/sidebar/NewConversationBtn';

interface ConversationRailProps {
  onNavigate?: () => void;
}

function SkeletonItem() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mx-1">
      <div className="h-1.5 w-1.5 rounded-full skeleton-line shrink-0" />
      <div className="skeleton-line h-3 flex-1 rounded" />
    </div>
  );
}

export default function ConversationRail({ onNavigate }: ConversationRailProps) {
  const { activeDataset } = useDatasets();
  const { conversations, isLoading, error, refreshConversations } = useConversation();

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: 'rgba(12, 15, 22, 0.75)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">
          Conversations
        </h2>
        {activeDataset && (
          <p className="mt-1 truncate text-xs text-slate-400 font-medium" title={activeDataset.name}>
            {activeDataset.name}
          </p>
        )}
      </div>

      {/* List */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
        {!activeDataset && (
          <p className="px-4 py-3 text-xs text-slate-600 leading-relaxed">
            Select a dataset to see your conversations.
          </p>
        )}

        {activeDataset && isLoading && (
          <div className="space-y-1 pt-1">
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
          </div>
        )}

        {activeDataset && error && (
          <div className="mx-2 space-y-2">
            <div
              className="rounded-lg px-3 py-2 text-xs text-red-300"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              {error}
            </div>
            <button
              type="button"
              onClick={() => void refreshConversations()}
              className="text-xs text-brand-indigo hover:text-brand-indigo-light underline"
            >
              Retry
            </button>
          </div>
        )}

        {activeDataset && !isLoading && !error && (
          <>
            {conversations.length === 0 ? (
              <p className="mb-3 px-4 text-xs text-slate-600">No conversations yet.</p>
            ) : (
              <div className="space-y-0.5 px-1">
                {conversations.map((c) => (
                  <ConversationItem
                    key={c.id}
                    conversation={c}
                    onAfterNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
            <div className="px-1">
              <NewConversationBtn onAfterCreate={onNavigate} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
