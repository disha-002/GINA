import React from 'react';

export function KeyFigure({ text }: { text: string }) {
  if (!text || text === '—') return null;
  const long = text.includes(' · ') || text.includes(' (total):') || text.length > 40;
  return (
    <div className="mb-2 max-w-full">
      <span
        className={`block font-bold tracking-tight text-white font-serif whitespace-normal leading-tight ${
          long ? 'text-xl sm:text-2xl' : 'text-4xl sm:text-5xl'
        }`}
        style={{ textShadow: '0 0 40px rgba(60,224,214,0.15)' }}
      >
        {text}
      </span>
    </div>
  );
}
