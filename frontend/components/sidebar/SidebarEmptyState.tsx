'use client';

import React from 'react';
import { Upload } from 'lucide-react';

interface SidebarEmptyStateProps {
  onUpload: () => void;
}

export function SidebarEmptyState({ onUpload }: SidebarEmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-8">
      <div className="mb-4 flex items-center justify-center h-12 w-12 rounded-lg bg-brand-indigo/20 text-brand-indigo">
        <Upload className="h-6 w-6" />
      </div>
      <h3 className="mb-2 text-sm font-semibold text-white">No Datasets Yet</h3>
      <p className="mb-6 text-center text-xs text-slate-500">
        Upload a CSV to start asking questions about your data
      </p>
      <button
        type="button"
        onClick={onUpload}
        className="inline-flex items-center justify-center rounded-lg bg-brand-indigo px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-indigo-light"
      >
        Upload Dataset
      </button>
    </div>
  );
}
