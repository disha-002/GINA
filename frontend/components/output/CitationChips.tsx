import React from 'react';

export function CitationChips({ citations }: { citations: string[] }) {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-600 font-medium">Based on:</span>
      {citations.map((chip, i) => (
        <span
          key={i}
          className="px-2.5 py-0.5 rounded-full text-xs font-medium text-brand-cyan transition-all duration-150"
          style={{
            background: 'rgba(60,224,214,0.07)',
            border: '1px solid rgba(60,224,214,0.20)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLSpanElement).style.borderColor = 'rgba(60,224,214,0.40)';
            (e.currentTarget as HTMLSpanElement).style.background = 'rgba(60,224,214,0.12)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLSpanElement).style.borderColor = 'rgba(60,224,214,0.20)';
            (e.currentTarget as HTMLSpanElement).style.background = 'rgba(60,224,214,0.07)';
          }}
        >
          {chip}
        </span>
      ))}
    </div>
  );
}
