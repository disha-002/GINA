'use client';

import { memo } from 'react';
import { Message, OutputPayload, PipelineStep } from '@/types';
import { ThinkingPill } from './ThinkingPill';
import { OutputCard } from '@/components/output/OutputCard';
import { Bot } from 'lucide-react';

export interface AssistantMessageProps {
  message: Message;
  steps?: PipelineStep[];
  output?: OutputPayload | null;
  isStreaming?: boolean;
  showReasoning?: boolean;
  onCorrectionClick?: () => void;
}

function AssistantMessageImpl({
  message,
  steps = [],
  output,
  isStreaming = false,
  showReasoning = false,
  onCorrectionClick,
}: AssistantMessageProps) {
  return (
    <div className="flex justify-start mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="w-full space-y-4">
        {/* While streaming, show the expanding Thinking Pill */}
        {isStreaming && (
          <ThinkingPill
            steps={steps}
            defaultExpanded={showReasoning}
          />
        )}

        {/* Show output card when streaming ends */}
        {!isStreaming && output && (
          <OutputCard payload={output} onCorrectionClick={onCorrectionClick} />
        )}

        {/* Fallback: just show message content */}
        {!isStreaming && !output && (
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-surface-secondary border border-surface-border flex items-center justify-center shrink-0">
               <Bot className="w-5 h-5 text-slate-400" />
            </div>
            <div className="px-6 py-4 rounded-xl bg-surface-secondary border border-surface-border text-slate-300 text-sm font-normal shadow-sm grow-0 mr-auto max-w-[800px]">
              {message.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const AssistantMessage = memo(AssistantMessageImpl);
