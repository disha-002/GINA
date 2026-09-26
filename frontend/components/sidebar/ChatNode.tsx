'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { Conversation } from '@/types';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';

interface ChatNodeProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
  showRelativeTime?: boolean;
  onRename?: (conversation: Conversation, newName: string) => void;
  onDelete?: (conversation: Conversation) => void;
  busy?: boolean;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsAgo < 60) return 'just now';
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  const daysAgo = Math.floor(hoursAgo / 24);
  if (daysAgo < 7) return `${daysAgo}d ago`;
  const weeksAgo = Math.floor(daysAgo / 7);
  if (weeksAgo < 4) return `${weeksAgo}w ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ChatNode({
  conversation,
  isActive,
  onClick,
  showRelativeTime = true,
  onRename,
  onDelete,
  busy,
}: ChatNodeProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingValue, setEditingValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const relativeTime = useMemo(() => formatRelativeTime(conversation.updatedAt), [conversation.updatedAt]);

  const title = conversation.title || 'Untitled Chat';

  const hasActions = Boolean(onRename || onDelete);

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleSaveRename = () => {
    const trimmed = editingValue.trim();
    if (trimmed && onRename) {
      onRename(conversation, trimmed);
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
          group flex w-full items-center gap-0.5 rounded-lg pr-1 animate-in fade-in duration-150
          ${isActive ? 'bg-brand-indigo/15' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="text"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={handleSaveRename}
          onKeyDown={handleKeyDown}
          placeholder="Chat title"
          className={`
            flex-1 min-w-0 rounded-lg border border-transparent bg-transparent px-3 py-2 text-sm
            ${isActive ? 'text-brand-indigo' : 'text-slate-400'}
            placeholder-slate-500 caret-slate-300
            focus:outline-none focus:ring-0 focus-visible:ring-0
          `}
        />
      </div>
    );
  }

  return (
    <div
      className={`
        group flex w-full items-center gap-0.5 rounded-lg pr-1 animate-in fade-in duration-150
        ${isActive ? 'bg-brand-indigo/15' : 'hover:bg-white/5'}
      `}
    >
      <button
        type="button"
        onClick={onClick}
        className={`
          flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm
          transition-colors
          ${
            isActive
              ? 'text-brand-indigo'
              : 'text-slate-400 hover:text-slate-300'
          }
        `}
      >
        <span className="flex-1 truncate text-left">{title}</span>
        {showRelativeTime && (
          <span className="shrink-0 text-[11px] text-slate-500">{relativeTime}</span>
        )}
      </button>

      {hasActions && (
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 opacity-70 transition-opacity hover:bg-white/10 hover:text-slate-300 group-hover:opacity-100 disabled:opacity-30"
            aria-label="Chat options"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full z-[80] mt-1 min-w-[140px] overflow-hidden rounded-lg border border-white/10 py-1 shadow-xl"
              style={{
                background: 'rgba(18, 22, 32, 0.98)',
                backdropFilter: 'blur(12px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {onRename && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditingValue(title);
                    setIsEditingName(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  Rename
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(conversation);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
