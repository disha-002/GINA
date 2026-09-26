'use client';

import { createContext, useContext, ReactNode } from 'react';

interface DatasetActionsContextType {
  onViewDataset?: () => void;
  onSemanticCorrections?: () => void;
  onDatasetOverview?: () => void;
}

const DatasetActionsContext = createContext<DatasetActionsContextType>({});

export function DatasetActionsProvider({
  children,
  onViewDataset,
  onSemanticCorrections,
  onDatasetOverview,
}: {
  children: ReactNode;
  onViewDataset?: () => void;
  onSemanticCorrections?: () => void;
  onDatasetOverview?: () => void;
}) {
  return (
    <DatasetActionsContext.Provider
      value={{ onViewDataset, onSemanticCorrections, onDatasetOverview }}
    >
      {children}
    </DatasetActionsContext.Provider>
  );
}

export function useDatasetActions() {
  return useContext(DatasetActionsContext);
}
