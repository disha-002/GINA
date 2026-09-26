'use client';

import { PipelineStep as PipelineStepType } from '@/types';

// Map backend orchestrator `step` field → UI labels (see backend sendStep in orchestrator.ts)
const STEP_LABELS: Record<string, string> = {
  schema_retrieval: 'Ranking columns for your question',
  planner: 'Understanding your question',
  cache_hit: 'Answer from cache',
  sql_generation: 'Generating SQL',
  sql_fallback: 'Using backup SQL path',
  db_execution: 'Running query on your data',
  secondary_query: 'Breaking down drivers',
  narration: 'Writing your answer',
  // Legacy / alternate names
  semantic_mapper: 'Mapping to your data',
  sql_generator: 'Generating query',
  executor: 'Running query',
  formatter: 'Formatting results',
  completeness_check: 'Final validation',
};

export interface PipelineStepProps {
  step: PipelineStepType;
}

export function PipelineStep({ step }: PipelineStepProps) {
  const label = STEP_LABELS[step.step] || step.step;

  const getStatusIcon = () => {
    switch (step.status) {
      case 'complete':
        return (
          <svg
            className="w-5 h-5 text-green-500 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      case 'running':
        return (
          <div className="w-5 h-5 border-2 border-brand-teal/50 border-t-brand-teal rounded-full animate-spin flex-shrink-0" />
        );
      case 'warning':
        return (
          <svg
            className="w-5 h-5 text-brand-amber flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        );
      default: // pending
        return <div className="w-5 h-5 rounded-full border-2 border-surface-border flex-shrink-0" />;
    }
  };

  const getStatusColor = () => {
    switch (step.status) {
      case 'complete':
        return 'text-green-400';
      case 'warning':
        return 'text-brand-amber';
      case 'running':
        return 'text-brand-teal';
      default:
        return 'text-slate-500';
    }
  };

  return (
    <div className="flex items-start gap-3">
      {getStatusIcon()}
      <div className="flex-1">
        <p className={`text-sm font-normal ${getStatusColor()}`}>
          {label}
        </p>
        {step.detail && (
          <p className="text-xs text-slate-400 mt-1">{step.detail}</p>
        )}
      </div>
    </div>
  );
}
