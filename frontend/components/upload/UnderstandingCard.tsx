import React from 'react';

interface UnderstandingCardProps {
  text: string;
  onCorrectionClick?: () => void;
}

export default function UnderstandingCard({ text, onCorrectionClick }: UnderstandingCardProps) {
  if (!text) return null;

  return (
    <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-5 relative overflow-hidden">
      {/* Decorative background blur */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-teal/10 blur-3xl rounded-full" />
      
      <div className="relative z-10">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-surface-secondary flex items-center justify-center shrink-0 shadow-sm border border-brand-teal/20">
            <span className="text-xl">✨</span>
          </div>
          
          <div className="flex-1 pt-1">
            <h3 className="text-sm font-semibold text-slate-200 mb-1.5 flex items-center gap-2">
              Dataset Understood
              <svg className="w-4 h-4 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </h3>
            
            <p className="text-sm text-slate-300 leading-relaxed max-w-prose mb-3">
              {text}
            </p>

            {onCorrectionClick && (
              <button
                type="button"
                onClick={onCorrectionClick}
                className="text-xs font-medium text-brand-amber hover:text-brand-amber-light underline underline-offset-4 decoration-brand-amber/30 hover:decoration-brand-amber-light transition-colors"
              >
                Something off? Fix column understanding
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
