'use client';

import React from 'react';
import type { Conversation } from '@/types';
import { ChatNode } from './ChatNode';

interface ChatNodeListProps {
  chats: Conversation[];
  activeConversation: Conversation | null;
  onSelectChat: (conversation: Conversation) => void;
  datasetId: string;
  isCreatingChat: boolean;
  showEmptyPrompt?: boolean;
  onStartNewChat?: () => void;
  onRenameChat?: (conversation: Conversation, newName: string) => void;
  onDeleteChat?: (conversation: Conversation) => void;
  chatActionsBusy?: boolean;
}

export function ChatNodeList({
  chats,
  activeConversation,
  onSelectChat,
  isCreatingChat,
  showEmptyPrompt = true,
  onStartNewChat,
  onRenameChat,
  onDeleteChat,
  chatActionsBusy,
}: ChatNodeListProps) {
  if (chats.length === 0 && showEmptyPrompt) {
    return (
      <div className="px-3 py-2">
        <p className="mb-2 text-xs text-slate-600">This dataset has no chats yet</p>
        <button
          type="button"
          onClick={onStartNewChat}
          disabled={isCreatingChat}
          className="inline-flex text-xs text-brand-indigo underline transition-colors hover:text-brand-indigo-light disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start with a question
        </button>
      </div>
    );
  }

  if (chats.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5 px-2 py-1">
      {chats.map((chat) => (
        <ChatNode
          key={chat.id}
          conversation={chat}
          isActive={activeConversation?.id === chat.id}
          onClick={() => onSelectChat(chat)}
          showRelativeTime
          onRename={onRenameChat}
          onDelete={onDeleteChat}
          busy={chatActionsBusy}
        />
      ))}
    </div>
  );
}
