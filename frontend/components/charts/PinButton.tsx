'use client';

import React from 'react';

export function PinButton({ 
  isPinned, 
  onToggle 
}: { 
  isPinned: boolean; 
  onToggle: () => void; 
}) {
  return (
    <button
      onClick={onToggle}
      className={`absolute top-4 right-4 p-2 rounded-lg transition-colors ${
        isPinned ? 'bg-brand-indigo text-white shadow-md shadow-brand-indigo/20' : 'bg-surface border border-surface-border text-slate-400 hover:text-slate-200'
      }`}
      aria-label={isPinned ? 'Unpin chart' : 'Pin chart'}
    >
      <svg className="w-4 h-4" fill={isPinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  );
}
