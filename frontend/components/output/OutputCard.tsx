'use client';

import React, { memo, useState, useEffect, useMemo } from 'react';
import { OutputPayload, ChartData, ChartType } from '@/types';
import { Maximize2, ChevronDown, ChevronUp } from 'lucide-react';
import { useUIState } from '@/lib/providers/UIStateProvider';

import { KeyFigure } from './KeyFigure';
import { NarrativeText } from './NarrativeText';
import { CitationChips } from './CitationChips';
import { SQLExpand } from './SQLExpand';
import { FollowUpSuggestions } from './FollowUpSuggestions';
import ChartRenderer, { hasRenderableChart } from '../charts/ChartRenderer';

export interface OutputCardProps {
  payload: OutputPayload;
  onCorrectionClick?: () => void;
}

function chartLabel(type: ChartType): string {
  switch (type) {
    case 'bar': return 'Bar Chart';
    case 'line': return 'Line Chart';
    case 'grouped_bar': return 'Grouped Bar';
    case 'stacked_bar': return 'Stacked Bar';
    case 'table': return 'Data Table';
    case 'big_number': return 'Key Figure';
    default: return 'Chart';
  }
}

function hasChartData(chartType?: ChartType, chartData?: ChartData): boolean {
  if (!chartType || !chartData) return false;

  // Don't show visualization for key figures - they're already displayed at the top
  if (chartType === 'big_number') {
    return false;
  }

  return hasRenderableChart(chartType, chartData);
}

function OutputCardImpl({ payload, onCorrectionClick }: OutputCardProps) {
  const { openInsightWithAll, registerChart, sessionCharts, insightPanelOpen } = useUIState();
  const [isExpanded, setIsExpanded] = useState(false);

  const renderableSessionCharts = useMemo(
    () => sessionCharts.filter((chart) => hasRenderableChart(chart.type, chart.data)),
    [sessionCharts],
  );

  const hasChart = hasChartData(payload.chartType, payload.chartData);
  const isGraphical = hasChart && payload.chartType !== 'table';
  const shouldCollapseChartInChat = hasChart && insightPanelOpen;

  useEffect(() => {
    if (hasChart) {
      registerChart({
        id: payload.messageId,
        type: payload.chartType!,
        data: payload.chartData!,
        title: chartLabel(payload.chartType!),
        resultTable: payload.resultTable ?? null,
        resultTruncated: payload.resultTruncated,
        explanation: payload.explanation,
      });
    }
  }, [
    hasChart,
    payload.messageId,
    payload.chartType,
    payload.chartData,
    payload.resultTable,
    payload.resultTruncated,
    payload.explanation,
    registerChart,
  ]);

  const handleOpenAllCharts = () => {
    if (renderableSessionCharts.length > 0) {
      const activeIndex = renderableSessionCharts.findIndex(
        (c) =>
          (c.id && c.id === payload.messageId) ||
          (!payload.messageId &&
            c.type === payload.chartType &&
            JSON.stringify(c.data) === JSON.stringify(payload.chartData)),
      );
      openInsightWithAll(renderableSessionCharts, Math.max(0, activeIndex));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        className="rounded-2xl p-6"
        style={{
          background: 'linear-gradient(160deg, rgba(20,24,34,0.95) 0%, rgba(28,33,46,0.85) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div className="mb-5">
          <KeyFigure text={payload.keyFigure} />
        </div>

        <div className="prose prose-invert prose-slate max-w-none text-slate-300 text-sm leading-relaxed mb-5">
          <NarrativeText text={payload.narrative} />
        </div>

        {hasChart && !shouldCollapseChartInChat && (
          <div
            className="relative mt-4 pt-4 group"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div
              className={`overflow-hidden transition-all duration-300 relative ${isGraphical && !isExpanded ? 'max-h-[200px]' : 'max-h-[1000px]'}`}
            >
              <ChartRenderer
                type={payload.chartType!}
                data={payload.chartData!}
                isInline={!isExpanded}
              />

              {isGraphical && !isExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#141822] to-transparent pointer-events-none" />
              )}

              <button
                type="button"
                onClick={handleOpenAllCharts}
                className="absolute top-4 right-4 p-2 rounded-lg bg-slate-800/80 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-700 z-10"
                title={
                  renderableSessionCharts.length > 1
                    ? `View all ${renderableSessionCharts.length} charts`
                    : 'View in Insights'
                }
              >
                <Maximize2 className="w-4 h-4 text-white" />
              </button>
            </div>

            {isGraphical && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full mt-2 flex items-center justify-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition-colors py-1"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" /> Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" /> Show More
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {payload.citationChips && payload.citationChips.length > 0 && (
          <div
            className="mt-5 pt-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <CitationChips citations={payload.citationChips} />
          </div>
        )}

        {payload.totalTimeMs != null &&
          Number.isFinite(payload.totalTimeMs) &&
          payload.totalTimeMs >= 0 && (
            <p
              className="mt-4 pt-3 text-xs text-slate-500 tabular-nums"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              Query time: {Math.round(payload.totalTimeMs).toLocaleString('en-GB')} ms
            </p>
          )}
      </div>

      {(payload.sql || payload.secondarySql) && (
        <SQLExpand
          sql={payload.sql}
          secondarySql={payload.secondarySql}
          rowsReturned={payload.rowCount}
          explanation={payload.explanation}
        />
      )}

      {payload.followUpSuggestions?.length && (
        <div className="flex flex-col gap-4">
          <FollowUpSuggestions suggestions={payload.followUpSuggestions} />
        </div>
      )}
    </div>
  );
}

export const OutputCard = memo(OutputCardImpl);
