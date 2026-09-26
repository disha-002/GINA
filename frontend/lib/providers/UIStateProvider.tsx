'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import type { ChartType, ChartData, QueryResultTable } from '@/types';
import { postSnapshotToggle } from '@/lib/api/debug';
import { useToast } from '@/lib/providers/ToastProvider';
import { hasRenderableChart } from '@/components/charts/ChartRenderer';

export interface PinnedChartState {
  type: ChartType;
  data: ChartData;
  title?: string;
  /** Assistant message id — keeps one entry per answer when charts look alike */
  id?: string;
  resultTable?: QueryResultTable | null;
  resultTruncated?: boolean;
  explanation?: string;
}

interface UIStateContextType {
  isSnapshotMode: boolean;
  toggleSnapshotMode: () => Promise<void>;
  insightPanelOpen: boolean;
  activeInsight: PinnedChartState | null;
  sessionCharts: PinnedChartState[];
  openInsight: (type: ChartType, data: ChartData, title?: string) => void;
  openInsightWithAll: (charts: PinnedChartState[], activeIndex?: number) => void;
  registerChart: (chart: PinnedChartState) => void;
  closeInsight: () => void;
}

const UIStateContext = createContext<UIStateContextType | undefined>(undefined);

export function UIStateProvider({ children }: { children: React.ReactNode }) {
  const [isSnapshotMode, setIsSnapshotMode] = useState(false);

  const { showToast } = useToast();

  const [insightPanelOpen, setInsightPanelOpen] = useState(false);
  const [activeInsight, setActiveInsight] = useState<PinnedChartState | null>(null);
  const [sessionCharts, setSessionCharts] = useState<PinnedChartState[]>([]);

  const pathname = usePathname();

  useEffect(() => {
    setActiveInsight(null);
    setSessionCharts([]);
    setInsightPanelOpen(false);
  }, [pathname]);

  const isRenderablePinnedChart = useCallback(
    (chart: PinnedChartState) => hasRenderableChart(chart.type, chart.data),
    [],
  );

  const registerChart = useCallback((chart: PinnedChartState) => {
    if (!isRenderablePinnedChart(chart)) {
      return;
    }

    const chartWithId = {
      ...chart,
      id: chart.id || `chart-${Date.now()}-${Math.random()}`,
    };
    setSessionCharts((prev) => {
      if (chart.id) {
        const i = prev.findIndex((c) => c.id === chart.id);
        if (i >= 0) {
          const next = [...prev];
          next[i] = chartWithId;
          return next;
        }
      }
      const exists = prev.some(
        (c) =>
          (chart.id ? c.id === chart.id : false) ||
          (!chart.id &&
            c.type === chart.type &&
            JSON.stringify(c.data) === JSON.stringify(chart.data)),
      );
      return exists ? prev : [...prev, chartWithId];
    });
  }, [isRenderablePinnedChart]);

  const openInsight = useCallback((type: ChartType, data: ChartData, title?: string) => {
    if (!hasRenderableChart(type, data)) {
      setActiveInsight(null);
      setInsightPanelOpen(false);
      return;
    }

    setActiveInsight({ type, data, title } as PinnedChartState);
    setInsightPanelOpen(true);
  }, []);

  const openInsightWithAll = useCallback((charts: PinnedChartState[], activeIndex?: number) => {
    const renderableCharts = charts.filter(isRenderablePinnedChart);

    if (renderableCharts.length === 0) {
      setSessionCharts([]);
      setActiveInsight(null);
      setInsightPanelOpen(false);
      return;
    }

    const chartsWithIds = renderableCharts.map((c, idx) => ({
      ...c,
      id: c.id || `chart-${Date.now()}-${idx}`,
    }));

    setSessionCharts(chartsWithIds);

    const preferred = charts[activeIndex ?? 0];
    let resolvedActiveIndex = 0;

    if (preferred) {
      resolvedActiveIndex = Math.max(
        0,
        chartsWithIds.findIndex(
          (c) =>
            (preferred.id && c.id === preferred.id) ||
            (!preferred.id &&
              c.type === preferred.type &&
              JSON.stringify(c.data) === JSON.stringify(preferred.data)),
        ),
      );
    }

    setActiveInsight(chartsWithIds[resolvedActiveIndex]);
    setInsightPanelOpen(true);
  }, [isRenderablePinnedChart]);

  const closeInsight = useCallback(() => {
    setInsightPanelOpen(false);
  }, []);

  const toggleSnapshotMode = useCallback(async () => {
    try {
      const res = await postSnapshotToggle();
      const next = res.snapshotMode;
      setIsSnapshotMode(next);
      showToast(`Snapshot mode ${next ? 'enabled' : 'disabled'}`, 'info', 3000);
    } catch (e) {
      console.error('Failed to toggle snapshot mode:', e);
    }
  }, [showToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        void toggleSnapshotMode();
      }
      if (e.key === 'Escape' && insightPanelOpen) {
        closeInsight();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [insightPanelOpen, closeInsight, toggleSnapshotMode]);

  return (
    <UIStateContext.Provider
      value={{
        isSnapshotMode,
        toggleSnapshotMode,
        insightPanelOpen,
        activeInsight,
        sessionCharts,
        openInsight,
        openInsightWithAll,
        registerChart,
        closeInsight,
      }}
    >
      {children}
    </UIStateContext.Provider>
  );
}

export function useUIState() {
  const context = useContext(UIStateContext);
  if (context === undefined) {
    throw new Error('useUIState must be used within a UIStateProvider');
  }
  return context;
}
