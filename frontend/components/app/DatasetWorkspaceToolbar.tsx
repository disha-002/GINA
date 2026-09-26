'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useDatasetActions } from '@/lib/context/DatasetActionsContext';

const btnClass =
  'inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white disabled:pointer-events-none disabled:opacity-50';

interface DatasetWorkspaceToolbarProps {
  datasetName: string;
  /** When set (e.g. `/app/[conversationId]`), shows a back control beside the title */
  backHref?: string;
  className?: string;
}

export function DatasetWorkspaceToolbar({
  datasetName,
  backHref,
  className,
}: DatasetWorkspaceToolbarProps) {
  const pathname = usePathname();
  const { onViewDataset, onSemanticCorrections, onDatasetOverview } = useDatasetActions();

  const isOverviewRoute =
    typeof pathname === 'string' && /\/app\/dataset\/[^/]+\/overview$/.test(pathname);

  return (
    <div
      className={[
        'h-20 px-8 flex items-center justify-between shrink-0 sticky top-0 z-10',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        background: 'rgba(10, 12, 18, 0.82)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="shrink-0 inline-flex items-center justify-center rounded-lg border border-white/10 p-2 text-slate-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
            aria-label="Back to chat"
            title="Back to chat"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <h2 className="text-lg font-bold tracking-tight text-white truncate">{datasetName}</h2>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onViewDataset && (
          <button type="button" onClick={onViewDataset} className={btnClass}>
            View data
          </button>
        )}
        {onSemanticCorrections && (
          <button type="button" onClick={onSemanticCorrections} className={btnClass}>
            Semantic Corrections
          </button>
        )}
        {onDatasetOverview && (
          <button
            type="button"
            onClick={onDatasetOverview}
            disabled={isOverviewRoute}
            aria-current={isOverviewRoute ? 'page' : undefined}
            className={btnClass}
          >
            Dataset overview
          </button>
        )}
      </div>
    </div>
  );
}
