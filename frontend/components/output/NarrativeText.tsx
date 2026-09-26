import React from 'react';

export function NarrativeText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="text-base text-slate-200 leading-relaxed mb-4 max-w-prose">
      {text}
    </p>
  );
}
