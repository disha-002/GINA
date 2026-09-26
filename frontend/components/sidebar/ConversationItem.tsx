import React, { useState, useEffect } from 'react';
import type { Conversation } from '@/types';
import { useConversation } from '@/lib/hooks/useConversation';
import clsx from 'clsx';
import { MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/lib/providers/ToastProvider';

interface ConversationItemProps {
  conversation: Conversation;
  /** e.g. close mobile conversation drawer */
  onAfterNavigate?: () => void;
}

function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export default function ConversationItem({ conversation, onAfterNavigate }: ConversationItemProps) {
  const {
    activeConversation,
    setActiveConversation,
    renameConversation,
    removeConversation,
  } = useConversation();
  const router = useRouter();
  const { showToast } = useToast();
  const isActive = activeConversation?.id === conversation.id;
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title || 'New Conversation');
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    setEditTitle(conversation.title || 'New Conversation');
  }, [conversation.id, conversation.title]);

  const handleNavigate = () => {
    setActiveConversation(conversation);
    router.push(`/app/${conversation.id}`);
    onAfterNavigate?.();
  };

  const handleRename = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      showToast('Title cannot be empty', 'error');
      return;
    }
    // DB title is still null: don't save the UI placeholder as a real title, or auto-title from the first message would never run
    if (!conversation.title && trimmed === 'New Conversation') {
      setIsEditing(false);
      return;
    }
    try {
      await renameConversation(conversation.id, trimmed);
      showToast('Conversation renamed', 'success');
      setIsEditing(false);
    } catch {
      showToast('Failed to rename conversation', 'error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete conversation "${conversation.title || 'Untitled'}"?`)) return;
    try {
      await removeConversation(conversation.id);
      showToast('Conversation deleted', 'success');
    } catch {
      showToast('Failed to delete conversation', 'error');
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        autoFocus
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        onBlur={handleRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleRename();
          if (e.key === 'Escape') {
            setEditTitle(conversation.title || 'New Conversation');
            setIsEditing(false);
          }
        }}
        className={clsx(
          'w-full rounded-lg px-3 py-2 text-sm bg-transparent border border-transparent focus:outline-none focus:ring-0 focus-visible:ring-0',
          isActive ? 'text-white' : 'text-slate-400',
        )}
        style={{
          background: 'transparent',
          border: '1px solid transparent',
        }}
      />
    );
  }

  return (
    <div className="relative group">
      <button
        onClick={handleNavigate}
        className={clsx(
          'w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 truncate relative overflow-hidden group',
          isActive ? 'text-white' : 'text-slate-400 hover:text-slate-100',
        )}
        style={
          isActive
            ? {
                background: 'linear-gradient(90deg, rgba(90,78,227,0.18) 0%, rgba(90,78,227,0.05) 100%)',
                borderLeft: '2px solid #7267F2',
              }
            : {
                borderLeft: '2px solid transparent',
              }
        }
        onMouseEnter={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(90,78,227,0.1)';
            (e.currentTarget as HTMLButtonElement).style.borderLeft = '2px solid rgba(90,78,227,0.3)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.background = '';
            (e.currentTarget as HTMLButtonElement).style.borderLeft = '2px solid transparent';
          }
        }}
      >
        <span className="flex items-center gap-2 relative z-10 pl-1 pr-6">
          <span
            className={clsx(
              'w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-150',
              isActive ? 'bg-brand-indigo-light' : 'bg-slate-600 group-hover:bg-slate-500',
            )}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-medium leading-snug">
              {conversation.title || 'New Conversation'}
            </span>
            {conversation.createdAt && (
              <span className="text-[10px] text-slate-600 group-hover:text-slate-500 transition-colors">
                {timeAgo(conversation.createdAt)}
              </span>
            )}
          </span>
        </span>
      </button>

      {/* Action Menu */}
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 text-slate-500 hover:text-slate-300 rounded-md transition-colors hover:bg-white/5"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>

        {showMenu && (
          <div
            className="absolute right-0 top-full z-50 mt-1 min-w-max overflow-hidden rounded-lg shadow-xl"
            style={{
              background: 'rgba(22, 27, 38, 0.97)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5 text-slate-500" />
              Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
