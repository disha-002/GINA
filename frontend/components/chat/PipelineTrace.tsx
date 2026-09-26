'use client';

import { PipelineStep as PipelineStepType } from '@/types';
import { PipelineStep } from './PipelineStep';

export interface PipelineTraceProps {
  steps: PipelineStepType[];
}

export function PipelineTrace({ steps }: PipelineTraceProps) {
  return (
    <div className="space-y-3 pl-4 border-l border-surface-border">
      {steps.map((step, idx) => (
        <PipelineStep key={idx} step={step} />
      ))}
    </div>
  );
}
