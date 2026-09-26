import React from 'react';

export function ConfidenceIndicator({ score }: { score: number }) {
  if (score === undefined || score === null) return null;

  let label = 'VERIFIED';
  let barColor = 'rgba(60,224,214,0.9)';
  let textColor = '#3CE0D6';
  let bgColor = 'rgba(60,224,214,0.08)';
  let borderColor = 'rgba(60,224,214,0.20)';

  if (score <= 40) {
    label = 'LOW ACCURACY';
    barColor = 'rgba(239,68,68,0.9)';
    textColor = '#EF4444';
    bgColor = 'rgba(239,68,68,0.08)';
    borderColor = 'rgba(239,68,68,0.20)';
  } else if (score <= 70) {
    label = 'ESTIMATED';
    barColor = 'rgba(245,158,11,0.9)';
    textColor = '#F59E0B';
    bgColor = 'rgba(245,158,11,0.08)';
    borderColor = 'rgba(245,158,11,0.20)';
  } else if (score >= 95) {
    label = 'HIGHEST ACCURACY';
  } else {
    label = 'HIGH ACCURACY';
  }

  return (
    <div
      className="flex flex-col items-end gap-1.5 rounded-xl px-3 py-2 shrink-0 group relative cursor-help"
      style={{ background: bgColor, border: `1px solid ${borderColor}` }}
    >
      <span className="text-[9px] font-bold tracking-[0.15em] uppercase transition-colors" style={{ color: 'rgba(100,116,139,0.8)' }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold font-mono" style={{ color: textColor }}>
          {score}%
        </span>
        <div
          className="w-14 h-1.5 rounded-full overflow-hidden shrink-0"
          style={{ background: 'rgba(42,48,60,0.6)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${score}%`,
              background: barColor,
              boxShadow: `0 0 6px ${barColor}`,
            }}
          />
        </div>
      </div>
      
      {/* Tooltip / Context message */}
      <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-slate-900 border border-slate-800 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
        <p className="text-[10px] text-slate-400 leading-tight">
          {score >= 90 
            ? "This answer is verified based on direct data matches." 
            : "This is a best-estimate based on identified data patterns."}
        </p>
      </div>
    </div>
  );
}
