'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Conversation, Dataset } from '@/types';
import { ChatNodeList } from './ChatNodeList';
import { SidebarErrorState } from './SidebarErrorState';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';

interface DatasetNodeProps {
  dataset: Dataset;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  chats: Conversation[] | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectChat: (conversation: Conversation) => void;
  activeConversation: Conversation | null;
  isCreatingChat: boolean;
  onRenameDataset?: (dataset: Dataset, newName: string) => void;
  onDeleteDataset?: (dataset: Dataset) => void;
  onRenameChat?: (conversation: Conversation, newName: string) => void;
  onDeleteChat?: (conversation: Conversation) => void;
  datasetActionsBusy?: boolean;
  chatActionsBusy?: boolean;
}

function SkeletonChatItem() {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 rounded-lg">
      <div className="h-1.5 w-1.5 rounded-full skeleton-line shrink-0" />
      <div className="skeleton-line h-3 flex-1 rounded" />
    </div>
  );
}

export function DatasetNode({
  dataset,
  isActive,
  isExpanded,
  onToggle,
  onSelect,
  chats,
  isLoading,
  error,
  onRetry,
  onSelectChat,
  activeConversation,
  isCreatingChat,
  onRenameDataset,
  onDeleteDataset,
  onRenameChat,
  onDeleteChat,
  datasetActionsBusy,
  chatActionsBusy,
}: DatasetNodeProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingValue, setEditingValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canMutateDataset = !!(onRenameDataset || onDeleteDataset);

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleRowClick = () => {
    if (!isActive) {
      onSelect();
    }
    onToggle();
  };

  const handleSaveRename = () => {
    const trimmed = editingValue.trim();
    if (trimmed && onRenameDataset) {
      onRenameDataset(dataset, trimmed);
    }
    setIsEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditingName(false);
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  if (isEditingName) {
    return (
      <div
        className={`
          group mx-1 flex w-full items-center gap-0.5 rounded-lg pr-0.5 animate-in fade-in duration-150
          ${isActive ? 'bg-brand-indigo/10' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="text"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={handleSaveRename}
          onKeyDown={handleKeyDown}
          placeholder="Dataset name"
          className={`
            flex-1 min-w-0 rounded-lg border border-transparent bg-transparent px-3 py-2.5 text-sm font-medium
            ${isActive ? 'text-brand-indigo' : 'text-slate-400'}
            placeholder-slate-500 caret-slate-300
            focus:outline-none focus:ring-0 focus-visible:ring-0
          `}
        />
      </div>
    );
  }

  return (
    <div>
      <div
        className={`
          group mx-1 flex w-full items-center gap-0.5 rounded-lg pr-0.5
          ${isActive ? 'bg-brand-indigo/10' : ''}
        `}
      >
        <button
          type="button"
          onClick={handleRowClick}
          className={`
            flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium
            transition-all duration-200
            ${
              isActive
                ? 'text-brand-indigo'
                : 'text-slate-400 hover:bg-brand-indigo/10 hover:text-slate-200'
            }
          `}
        >
          <span
            className={`
            shrink-0 text-xs transition-transform duration-200
            ${isExpanded ? 'rotate-90' : 'rotate-0'}
          `}
          >
            ▶
          </span>

          <span className="flex-1 truncate">{dataset.name}</span>

          <div className="flex shrink-0 gap-1 text-[10px] text-slate-500">
            {dataset.rowCount !== null && <span>{dataset.rowCount.toLocaleString()} rows</span>}
            {dataset.columnCount !== null && <span>• {dataset.columnCount} cols</span>}
          </div>
        </button>

        {canMutateDataset && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              disabled={datasetActionsBusy}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 opacity-70 transition-opacity hover:bg-white/10 hover:text-slate-300 group-hover:opacity-100 disabled:opacity-30"
              aria-label="Dataset options"
              aria-expanded={menuOpen}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full z-[80] mt-1 min-w-[150px] overflow-hidden rounded-lg border border-white/10 py-1 shadow-xl"
                style={{
                  background: 'rgba(18, 22, 32, 0.98)',
                  backdropFilter: 'blur(12px)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {onRenameDataset && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                    onClick={() => {
                      setMenuOpen(false);
                      setEditingValue(dataset.name);
                      setIsEditingName(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    Rename dataset
                  </button>
                )}
                {onDeleteDataset && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeleteDataset(dataset);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                    Delete dataset
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="ml-2">
          {isLoading && (
            <div className="space-y-1 pt-1">
              <SkeletonChatItem />
              <SkeletonChatItem />
              <SkeletonChatItem />
            </div>
          )}

          {!isLoading && error && (
            <div className="pt-1">
              <SidebarErrorState error={error} onRetry={onRetry} />
            </div>
          )}

          {!isLoading && !error && chats !== null && (
            <ChatNodeList
              chats={chats}
              activeConversation={activeConversation}
              onSelectChat={onSelectChat}
              datasetId={dataset.id}
              isCreatingChat={isCreatingChat}
              showEmptyPrompt
              onRenameChat={onRenameChat}
              onDeleteChat={onDeleteChat}
              chatActionsBusy={chatActionsBusy}
            />
          )}
        </div>
      )}
    </div>
  );
}
