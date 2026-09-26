'use client';

import { useDatasets } from '@/lib/hooks/useDatasets';
import { useUploadModal } from '@/lib/hooks/useUploadModal';
import WorkspaceWelcome from '@/components/app/WorkspaceWelcome';

export default function AppPage() {
  const { datasets, isLoading: datasetsLoading, error: datasetsError, refreshDatasets } = useDatasets();
  const { openUploadModal } = useUploadModal();

  if (datasetsLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-surface p-8 text-slate-400 relative">
        {/* Background mesh gradient */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-gradient-to-br from-brand-indigo/5 to-transparent blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gradient-to-tr from-brand-teal/5 to-transparent blur-3xl" />
        </div>
        
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 rounded-full border-2 border-brand-teal/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-brand-teal border-t-transparent" />
          </div>
          <p className="text-sm font-medium">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (datasetsError) {
    return (
      <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center bg-surface p-8 text-center">
        <div className="mb-4 w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-sm text-red-300">
          {datasetsError}
        </div>
        <button
          type="button"
          onClick={() => void refreshDatasets()}
          className="rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-brand-teal-light"
        >
          Retry
        </button>
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-surface p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-surface-border bg-[#1C212E]">
          <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
        </div>
        <h3 className="mb-2 font-serif text-xl font-semibold text-slate-200">No datasets yet</h3>
        <p className="mb-6 max-w-md text-sm text-slate-400">
          Upload a CSV to get started. Your datasets will show up here.
        </p>
        <button
          type="button"
          onClick={openUploadModal}
          className="rounded-xl bg-brand-indigo px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-indigo/20 transition-all hover:bg-brand-indigo-light"
        >
          Upload dataset
        </button>
      </div>
    );
  }

  return <WorkspaceWelcome />;
}
