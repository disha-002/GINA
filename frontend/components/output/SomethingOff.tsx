'use client';

import React from 'react';

export function SomethingOff({ onCorrectionClick }: { onCorrectionClick?: () => void }) {
  if (!onCorrectionClick) return null;

  return (
    <div className="mt-4 pt-4 border-t border-surface-border flex justify-end">
      <button 
        onClick={() => onCorrectionClick?.()}
        className="text-xs font-medium text-brand-amber opacity-80 hover:opacity-100 flex items-center gap-1 transition-opacity"
      >
        Something off? 
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </button>
    </div>
  );
}
