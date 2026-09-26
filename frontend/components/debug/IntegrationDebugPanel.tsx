'use client';

import React, { useCallback, useState } from 'react';
import { getHealth, postSnapshotToggle } from '@/lib/api/debug';

type PanelStatus = { kind: 'idle' } | { kind: 'ok'; label: string; detail: string } | { kind: 'err'; message: string };

export default function IntegrationDebugPanel() {
  const [health, setHealth] = useState<PanelStatus>({ kind: 'idle' });
  const [snapshot, setSnapshot] = useState<PanelStatus>({ kind: 'idle' });

  const onHealth = useCallback(() => {
    setHealth({ kind: 'idle' });
    void (async () => {
      try {
        const j = await getHealth();
        setHealth({
          kind: 'ok',
          label: 'GET /health',
          detail: JSON.stringify(j),
        });
      } catch (e) {
        setHealth({
          kind: 'err',
          message: e instanceof Error ? e.message : 'Request failed',
        });
      }
    })();
  }, []);

  const onSnapshot = useCallback(() => {
    setSnapshot({ kind: 'idle' });
    void (async () => {
      try {
        const j = await postSnapshotToggle();
        setSnapshot({
          kind: 'ok',
          label: 'POST /api/snapshot/toggle',
          detail: `snapshotMode: ${String(j.snapshotMode)}`,
        });
      } catch (e) {
        setSnapshot({
          kind: 'err',
          message: e instanceof Error ? e.message : 'Request failed',
        });
      }
    })();
  }, []);

  return (
    <div className="border-t border-surface-border p-3 shrink-0">
      <details className="group">
        <summary className="cursor-pointer text-xs font-semibold text-slate-500 tracking-wider list-none flex items-center justify-between gap-2 select-none">
          <span>Integration</span>
          <span className="text-slate-600 group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="mt-3 space-y-3 text-xs">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onHealth}
              className="w-full px-2 py-1.5 rounded-md bg-surface-tertiary hover:bg-slate-700/50 text-slate-200 border border-surface-border text-left"
            >
              Check backend health
            </button>
            <StatusLine status={health} />
          </div>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onSnapshot}
              className="w-full px-2 py-1.5 rounded-md bg-surface-tertiary hover:bg-slate-700/50 text-slate-200 border border-surface-border text-left"
            >
              Toggle snapshot mode
            </button>
            <StatusLine status={snapshot} />
          </div>
        </div>
      </details>
    </div>
  );
}

function StatusLine({ status }: { status: PanelStatus }) {
  if (status.kind === 'idle') return null;
  if (status.kind === 'err') {
    return (
      <p className="text-red-300/90 break-words leading-snug" role="status">
        {status.message}
      </p>
    );
  }
  return (
    <p className="text-emerald-400/90 break-words leading-snug font-mono" role="status">
      <span className="text-slate-500">{status.label}</span> → {status.detail}
    </p>
  );
}
