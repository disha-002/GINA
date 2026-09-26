'use client';

import React, { memo } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

function FollowUpSuggestionsImpl({ suggestions }: { suggestions: string[] }) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-3.5 h-3.5 text-brand-indigo-light" />
        <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-600 uppercase">
          Suggested Follow-ups
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => {
              const event = new CustomEvent('ttd:submit-chat', { detail: suggestion });
              window.dispatchEvent(event);
            }}
            className="group flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all duration-150 relative overflow-hidden"
            style={{
              background: 'rgba(15,18,26,0.6)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = 'rgba(90,78,227,0.08)';
              el.style.borderColor = 'rgba(90,78,227,0.35)';
              el.style.transform = 'translateX(3px)';
              el.style.boxShadow = '-3px 0 0 0 #7267F2, 0 4px 16px rgba(0,0,0,0.2)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = 'rgba(15,18,26,0.6)';
              el.style.borderColor = 'rgba(255,255,255,0.07)';
              el.style.transform = '';
              el.style.boxShadow = '';
            }}
          >
            <span className="text-sm text-slate-400 group-hover:text-white transition-colors duration-150">
              {suggestion}
            </span>
            <div className="flex items-center justify-center w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-150 -translate-x-2 group-hover:translate-x-0 shrink-0 ml-3"
              style={{ background: 'rgba(90,78,227,0.15)' }}
            >
              <ArrowRight className="w-3 h-3 text-brand-indigo-light" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export const FollowUpSuggestions = memo(FollowUpSuggestionsImpl);
