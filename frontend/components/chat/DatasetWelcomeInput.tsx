'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConversation } from '@/lib/hooks/useConversation';
import { Plus } from 'lucide-react';

interface DatasetWelcomeInputProps {
  datasetId: string;
}

export function DatasetWelcomeInput({ datasetId }: DatasetWelcomeInputProps) {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const { createNewConversation } = useConversation();

  const handleNewChat = async () => {
    setIsCreating(true);
    try {
      const conversation = await createNewConversation();
      if (conversation) {
        router.push(`/app/${conversation.id}`);
        return;
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
    setIsCreating(false);
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-4" style={{ fontFamily: 'Inter, sans-serif' }}>
      <p className="mb-3 text-xs text-slate-400">Start a fresh conversation for this dataset.</p>
      <button
        onClick={handleNewChat}
        disabled={isCreating}
        className="inline-flex w-fit items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-normal text-brand-teal shadow-[0_8px_28px_rgba(0,0,0,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-teal/40 hover:bg-brand-teal/[0.08] hover:text-[#6EF4EC] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-brand-indigo-light/70"
        aria-label={`Start new chat for dataset ${datasetId}`}
      >
        {isCreating ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Creating chat…
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            New Chat
          </>
        )}
      </button>
    </div>
  );
}
