'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DatasetWorkspaceToolbar } from '@/components/app/DatasetWorkspaceToolbar';
import { hasRenderableChart, renderChart } from '@/components/charts/ChartRenderer';
import { getDatasetOverview } from '@/lib/api/datasets';
import type { BigNumberChartData, ChartData, ChartType, DatasetOverviewStored } from '@/types';
import { useDatasets } from '@/lib/hooks/useDatasets';
import { formatChartAxisLabel } from '@/lib/charts/formatChartNumber';

function isOverviewStored(v: unknown): v is DatasetOverviewStored {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o['version'] === 1 && typeof o['executiveSummary'] === 'string' && Array.isArray(o['charts']);
}

function isSafeConversationIdSegment(id: string): boolean {
  return id.length > 0 && id.length <= 128 && !id.includes('/') && !id.includes('..') && /^[\w-]+$/.test(id);
}

/** Skip overview slots where the chart would render nothing (same rules as chat + finite big_number). */
function overviewChartHasRenderableData(chartType: ChartType, chartData: ChartData): boolean {
  if (chartType === 'big_number') {
    const d = chartData as BigNumberChartData;
    const n = typeof d.value === 'number' ? d.value : parseFloat(String(d.value ?? ''));
    return Number.isFinite(n);
  }
  return hasRenderableChart(chartType, chartData);
}

function DatasetOverviewContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const datasetId = typeof params['datasetId'] === 'string' ? params['datasetId'] : '';
  const { activeDataset, setActiveDataset, datasets } = useDatasets();

  const fromRaw = searchParams.get('from');
  const backToChatHref =
    fromRaw && isSafeConversationIdSegment(fromRaw) ? `/app/${fromRaw}` : undefined;

  const [status, setStatus] = useState<'loading' | 'pending' | 'ready' | 'failed'>('loading');
  const [overview, setOverview] = useState<DatasetOverviewStored | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    const ds = datasets.find((d) => d.id === datasetId);
    if (ds) setActiveDataset(datasetId);
  }, [datasetId, datasets, setActiveDataset]);

  const poll = useCallback(async () => {
    if (!datasetId) return;
    try {
      const res = await getDatasetOverview(datasetId);
      if (res.status === 'pending') {
        setStatus('pending');
        return;
      }
      if (res.status === 'failed') {
        setStatus('failed');
        setError(res.error);
        return;
      }
      setStatus('ready');
      const ov = res.overview;
      if (isOverviewStored(ov)) {
        setOverview(ov);
      } else {
        setError('Invalid overview payload');
        setStatus('failed');
      }
    } catch (e) {
      setStatus('failed');
      setError(e instanceof Error ? e.message : 'Failed to load overview');
    }
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    void poll();
  }, [datasetId, poll]);

  useEffect(() => {
    if (status !== 'pending') return;
    const id = setInterval(() => void poll(), 2500);
    return () => clearInterval(id);
  }, [status, poll]);

  const title = activeDataset?.name ?? 'Dataset';

  const chartsToShow = useMemo(() => {
    if (!overview) return [];
    return overview.charts.filter((ch) =>
      overviewChartHasRenderableData(ch.chartType as ChartType, ch.chartData as ChartData),
    );
  }, [overview]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0F121A]">
      <DatasetWorkspaceToolbar datasetName={title} backHref={backToChatHref} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-teal/30 border-t-brand-teal" />
            <p className="text-sm">Loading overview…</p>
          </div>
        )}

        {status === 'pending' && (
          <div className="mx-auto max-w-lg rounded-xl border border-brand-teal/20 bg-brand-teal/5 px-5 py-8 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-brand-teal/30 border-t-brand-teal" />
            <p className="font-medium text-slate-200">Preparing your dataset overview</p>
            <p className="mt-2 text-sm text-slate-400">
              We&apos;re analyzing columns and building charts. This usually takes a few seconds.
            </p>
          </div>
        )}

        {status === 'failed' && (
          <div className="mx-auto max-w-lg rounded-xl border border-red-500/25 bg-red-500/10 px-5 py-6 text-center">
            <p className="text-sm text-red-200">{error ?? 'Overview unavailable'}</p>
            <p className="mt-3 text-xs text-slate-500">
              Try again after adjusting semantic corrections, or re-upload the file.
            </p>
            <Link
              href="/app"
              className="mt-4 inline-block text-sm font-medium text-brand-teal hover:underline"
            >
              Back to workspace
            </Link>
          </div>
        )}

        {status === 'ready' && overview && (
          <div className="mx-auto max-w-5xl space-y-8">
            <section className="rounded-2xl border border-white/8 bg-[rgba(8,10,15,0.5)] p-5 md:p-6">
              <h2 className="mb-2 font-medium text-slate-200">At a glance</h2>
              <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
                {overview.executiveSummary}
              </p>
              {overview.statsHeadline && (
                <p className="mt-3 text-xs text-slate-500">
                  {overview.statsHeadline.rowCount.toLocaleString()} rows ·{' '}
                  {overview.statsHeadline.columnCount} columns
                </p>
              )}
            </section>

            {overview.highlights.length > 0 && (
              <section>
                <h2 className="mb-3 font-medium text-slate-200">Highlights</h2>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-400">
                  {overview.highlights.map((h, i) => (
                    <li key={i}>{formatChartAxisLabel(h)}</li>
                  ))}
                </ul>
              </section>
            )}

            {chartsToShow.length > 0 && (
              <section>
                <h2 className="mb-4 font-medium text-slate-200">Charts</h2>
                <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                  {chartsToShow.map((ch, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col rounded-2xl border border-white/8 bg-[rgba(8,10,15,0.45)] p-4"
                    >
                      <h3 className="mb-1 text-sm font-medium text-slate-200">{ch.title}</h3>
                      {ch.insight && (
                        <p className="mb-3 text-xs text-slate-500">{formatChartAxisLabel(ch.insight)}</p>
                      )}
                      <div className="min-h-[280px] flex-1">
                        {renderChart(ch.chartType as ChartType, ch.chartData as ChartData)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DatasetOverviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#0F121A] py-20 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-teal/30 border-t-brand-teal" />
          <p className="mt-3 text-sm">Loading…</p>
        </div>
      }
    >
      <DatasetOverviewContent />
    </Suspense>
  );
}
