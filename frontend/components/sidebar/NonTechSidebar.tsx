'use client';

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSidebarViewModel } from '@/lib/hooks/useSidebarViewModel';
import { useToast } from '@/lib/providers/ToastProvider';
import { useDeleteConfirm } from '@/lib/context/DeleteConfirmContext';
import { SidebarHeaderActions } from './SidebarHeaderActions';
import { DatasetTree } from './DatasetTree';
import { SidebarEmptyState } from './SidebarEmptyState';
import { SidebarErrorState } from './SidebarErrorState';
import type { Conversation, Dataset } from '@/types';

interface NonTechSidebarProps {
  onNavigate?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

/**
 * Non-Technical Unified Sidebar
 * 
 * Replaces the conversation-only rail with a nested dataset/chat tree
 * optimized for non-technical users. Features:
 * - Datasets as parent rows, chats as child rows
 * - Lazy-loaded conversations per dataset
 * - Per-dataset error handling and retry
 * - Persistent expand/collapse state
 * - Mobile auto-close on selection
 */
export default function NonTechSidebar({
  onNavigate,
  isCollapsed = false,
  onToggleCollapse,
}: NonTechSidebarProps) {
  const router = useRouter();
  const vm = useSidebarViewModel();
  const { showToast } = useToast();
  const { showDeleteConfirm } = useDeleteConfirm();
  const [sidebarMutating, setSidebarMutating] = useState(false);

  const handleSelectDataset = useCallback(
    (dataset: Dataset) => {
      vm.setActiveDataset(dataset);
    },
    [vm],
  );

  const handleSelectChat = useCallback(
    (conversation: Conversation, datasetId: string) => {
      void datasetId;
      vm.setActiveConversation(conversation);
      router.push(`/app/${conversation.id}`);
      onNavigate?.();
    },
    [vm, router, onNavigate],
  );

  const handleNewChat = useCallback(async () => {
    if (!vm.activeDataset) return;
    const newConv = await vm.createNewChat();
    if (newConv) {
      vm.setActiveConversation(newConv);
      router.push(`/app/${newConv.id}`);
      onNavigate?.();
    }
  }, [vm, router, onNavigate]);

  const handleUpload = useCallback(() => {
    vm.openUploadModal();
  }, [vm]);

  const handleRetryDataset = useCallback(
    (datasetId: string) => {
      vm.retryLoadDatasetConversations(datasetId);
    },
    [vm],
  );

  const handleRenameDataset = useCallback(
    (dataset: Dataset, newName: string) => {
      void (async () => {
        setSidebarMutating(true);
        try {
          await vm.renameDataset(dataset, newName);
          showToast('Dataset renamed', 'success');
        } catch {
          showToast('Failed to rename dataset', 'error');
        } finally {
          setSidebarMutating(false);
        }
      })();
    },
    [vm, showToast],
  );

  const handleDeleteDataset = useCallback(
    (dataset: Dataset) => {
      showDeleteConfirm(dataset, 'dataset', async () => {
        setSidebarMutating(true);
        try {
          await vm.deleteDataset(dataset);
          showToast('Dataset deleted', 'success');
        } catch {
          showToast('Failed to delete dataset', 'error');
        } finally {
          setSidebarMutating(false);
        }
      });
    },
    [vm, showToast, showDeleteConfirm],
  );

  const handleDeleteChat = useCallback(
    (conversation: Conversation) => {
      showDeleteConfirm(conversation, 'chat', async () => {
        setSidebarMutating(true);
        try {
          await vm.deleteChat(conversation);
          showToast('Conversation deleted', 'success');
        } catch (error) {
          showToast('Failed to delete conversation', 'error');
          throw error;
        } finally {
          setSidebarMutating(false);
        }
      });
    },
    [vm, showToast, showDeleteConfirm],
  );

  const handleRenameChat = useCallback(
    (conversation: Conversation, newName: string) => {
      void (async () => {
        setSidebarMutating(true);
        try {
          await vm.renameChat(conversation, newName);
          showToast('Conversation renamed', 'success');
        } catch {
          showToast('Failed to rename conversation', 'error');
        } finally {
          setSidebarMutating(false);
        }
      })();
    },
    [vm, showToast],
  );

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: 'rgba(12, 15, 22, 0.75)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header with Actions */}
      <SidebarHeaderActions
        onNewChat={handleNewChat}
        onUpload={handleUpload}
        activeDataset={vm.activeDataset}
        isCreatingChat={vm.isCreatingChat}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
      />

      {/* Main Content Area */}
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${isCollapsed ? 'hidden' : ''}`}>
        {/* No Datasets: Empty State */}
        {vm.datasetsLoading === false && vm.datasets.length === 0 && (
          <SidebarEmptyState onUpload={handleUpload} />
        )}

        {/* Datasets Load Error */}
        {vm.datasetsLoading === false && vm.datasetsError && vm.datasets.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center">
            <SidebarErrorState
              error={vm.datasetsError}
              onRetry={vm.refreshDatasets}
            />
          </div>
        )}

        {/* Datasets Exist: Show Tree */}
        {vm.datasets.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
            <DatasetTree
              datasets={vm.datasets}
              activeDataset={vm.activeDataset}
              expandedDatasetIds={vm.expandedDatasetIds}
              onToggleExpand={vm.toggleExpandDataset}
              onSelectDataset={handleSelectDataset}
              conversationsByDataset={vm.conversationsByDataset}
              loadingDatasetIds={vm.loadingDatasetIds}
              errorsByDataset={vm.errorsByDataset}
              onRetryDataset={handleRetryDataset}
              onSelectChat={handleSelectChat}
              activeConversation={vm.activeConversation}
              isCreatingChat={vm.isCreatingChat}
              onRenameDataset={handleRenameDataset}
              onDeleteDataset={handleDeleteDataset}
              onRenameChat={handleRenameChat}
              onDeleteChat={handleDeleteChat}
              datasetActionsBusy={sidebarMutating}
              chatActionsBusy={sidebarMutating}
            />
          </div>
        )}
      </div>

      {/* Collapsed View: Dataset Icons with Expandable Chats */}
      {isCollapsed && vm.datasets.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2 px-2">
          {[...vm.datasets]
            .sort((a, b) => {
              if (vm.activeDataset?.id === a.id) return -1;
              if (vm.activeDataset?.id === b.id) return 1;
              return 0;
            })
            .map((dataset) => {
              return (
                <div key={dataset.id} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectDataset(dataset);
                    }}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ${ vm.activeDataset?.id === dataset.id
                        ? 'bg-brand-indigo/30 text-brand-indigo'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                    }`}
                    title={dataset.name}
                  >
                    <span className="text-sm font-medium">{dataset.name.charAt(0).toUpperCase()}</span>
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
