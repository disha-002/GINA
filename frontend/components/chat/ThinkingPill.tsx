'use client';

import { useState, useEffect } from 'react';
import { PipelineTrace } from './PipelineTrace';
import { PipelineStep } from '@/types';
import { ChevronDown } from 'lucide-react';
import { useReasoningToggle } from '@/lib/hooks/useReasoningToggle';

export interface ThinkingPillProps {
  steps: PipelineStep[];
  defaultExpanded?: boolean;
}

export function ThinkingPill({ steps, defaultExpanded = false }: ThinkingPillProps) {
  const { setReasoning } = useReasoningToggle();
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const handleToggle = () => {
    const nextState = !expanded;
    setExpanded(nextState);
    if (nextState) {
      setReasoning(true);
    } else {
      setReasoning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 mb-4">
      <button
        onClick={handleToggle}
        className="group flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl w-fit transition-all duration-200"
        style={{
          backdropFilter: 'blur(8px)',
          background: 'rgba(90,78,227,0.08)',
          border: '1px solid rgba(90,78,227,0.22)',
          boxShadow: '0 0 0 0 rgba(90,78,227,0)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(90,78,227,0.13)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(90,78,227,0.40)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(90,78,227,0.08)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(90,78,227,0.22)';
        }}
      >
        <div className="flex items-center gap-3">
          {/* Animated thinking dots */}
          <div className="flex items-center gap-1 shrink-0">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 rounded-full bg-brand-indigo-light animate-bounce"
                style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.9s' }}
              />
            ))}
          </div>
          <span className="text-sm font-normal text-slate-300">
            Thinking
          </span>
          {steps.length > 0 && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(90,78,227,0.2)', color: 'rgba(162,155,254,0.9)' }}
            >
              {steps.length} step{steps.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ml-2 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="pl-4 animate-in fade-in duration-200">
          <PipelineTrace steps={steps} />
        </div>
      )}
    </div>
  );
}
