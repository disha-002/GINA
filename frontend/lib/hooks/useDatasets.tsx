'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Dataset } from '@/types';
import { listDatasets } from '@/lib/api/datasets';
import { useAuth } from '@/lib/hooks/useAuth';

interface DatasetContextType {
  datasets: Dataset[];
  activeDataset: Dataset | null;
  setActiveDataset: (dataset: Dataset | string | null) => void;
  refreshDatasets: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

const DatasetContext = createContext<DatasetContextType | undefined>(undefined);

const ACTIVE_DATASET_STORAGE_KEY = 'gina-active-dataset-id';

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDataset, setActiveDatasetState] = useState<Dataset | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session, isLoading: authLoading } = useAuth();

  const refreshDatasets = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const fetchedDatasets = await listDatasets();
      const userDatasets = fetchedDatasets.filter((d) => !d.isDemo);
      setDatasets(userDatasets);

      if (userDatasets.length > 0) {
        setActiveDatasetState((current) => {
          const stillValid =
            current && userDatasets.some((d) => d.id === current.id)
              ? userDatasets.find((d) => d.id === current.id) || current
              : null;
          if (stillValid) return stillValid;

          if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem(ACTIVE_DATASET_STORAGE_KEY);
            if (saved) {
              const fromStorage = userDatasets.find((d) => d.id === saved);
              if (fromStorage) return fromStorage;
            }
          }

          // Do not auto-pick the first dataset — user chooses on the welcome screen
          return null;
        });
      } else {
        setActiveDatasetState(null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load datasets';
      setError(message);
    } finally {
      setListLoading(false);
    }
  }, []);

  // Wait for auth to resolve, then load datasets when a session exists.
  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      setDatasets([]);
      setActiveDatasetState(null);
      setError(null);
      return;
    }

    void refreshDatasets();
  }, [authLoading, session, refreshDatasets]);

  const setActiveDataset = useCallback(
    (datasetOrId: Dataset | string | null) => {
      if (datasetOrId === null) {
        setActiveDatasetState(null);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(ACTIVE_DATASET_STORAGE_KEY);
        }
      } else if (typeof datasetOrId === 'string') {
        const found = datasets.find((d) => d.id === datasetOrId);
        if (found) {
          setActiveDatasetState(found);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(ACTIVE_DATASET_STORAGE_KEY, found.id);
          }
        }
      } else {
        setActiveDatasetState(datasetOrId);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(ACTIVE_DATASET_STORAGE_KEY, datasetOrId.id);
        }
      }
    },
    [datasets]
  );

  const isLoading = authLoading || listLoading;

  return (
    <DatasetContext.Provider
      value={{
        datasets,
        activeDataset,
        setActiveDataset,
        refreshDatasets,
        isLoading,
        error,
      }}
    >
      {children}
    </DatasetContext.Provider>
  );
}

export function useDatasets(): DatasetContextType {
  const context = useContext(DatasetContext);
  if (context === undefined) {
    throw new Error('useDatasets must be used within a DatasetProvider');
  }
  return context;
}
