'use client';

import { useCallback, useState } from 'react';
import { PipelineStep, QueryPayload, OutputPayload } from '@/types';
import { streamQuery } from '@/lib/api/query';
import { createClient } from '@/lib/supabase/client';

export function usePipeline() {
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [result, setResult] = useState<OutputPayload | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runQuery = useCallback(
    async (payload: QueryPayload) => {
      setIsStreaming(true);
      setError(null);
      setSteps([]);
      setResult(null);

      try {
        const supabase = createClient();
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          throw new Error('Not authenticated');
        }

        for await (const event of streamQuery(payload, token)) {
          if (event.event === 'step') {
            // Update or add step
            const stepData = event.data as PipelineStep;
            setSteps((prev) => {
              const existing = prev.findIndex((s) => s.step === stepData.step);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = stepData;
                return updated;
              }
              return [...prev, stepData];
            });
          } else if (event.event === 'result') {
            // Final result received
            const resultData = event.data as OutputPayload;
            setResult(resultData);
          } else if (event.event === 'error') {
            const errPayload = event.data as { message?: string; recoverable?: boolean };
            throw new Error(errPayload.message ?? 'Pipeline reported an error');
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown query error';
        setError(message);
      } finally {
        setIsStreaming(false);
      }
    },
    []
  );

  return {
    steps,
    result,
    isStreaming,
    error,
    runQuery,
  };
}
