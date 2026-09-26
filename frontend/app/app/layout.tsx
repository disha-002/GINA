'use client';

import React from 'react';
import AppShell from '@/components/app/AppShell';
import { DatasetProvider } from '@/lib/hooks/useDatasets';
import { ConversationProvider } from '@/lib/hooks/useConversation';
import { UploadModalProvider } from '@/lib/hooks/useUploadModal';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DatasetProvider>
      <ConversationProvider>
        <UploadModalProvider>
          <AppShell>{children}</AppShell>
        </UploadModalProvider>
      </ConversationProvider>
    </DatasetProvider>
  );
}

