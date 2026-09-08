import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { useDeskStore } from '@/features/desk';
import { useStudioNavigation } from '@/shared/config/navigation';
import { studioPath } from '@/shared/config/routes';

import type { IdeTab } from './ide.store';
import { useIdeStore } from './ide.store';

export function useOpenIdeTab() {
  const navigate = useNavigate();
  return (workspaceId: string, tab: IdeTab) => {
    if (tab.kind === 'thread' && tab.threadId) {
      void navigate(studioPath.thread(workspaceId, tab.threadId));
      return;
    }
    if (tab.kind === 'file' && tab.path) {
      void navigate(studioPath.file(workspaceId, tab.path));
    }
  };
}

/**
 * Extracted from thread-header.tsx goTo: ide-store tab + desk focus + URL.
 * Hooks (not plain functions) because URL navigation needs the router context.
 */
export function useOpenThreadTab() {
  const { openThread } = useStudioNavigation();
  return useCallback(
    (workspaceId: string, agentId: string, threadId: string) => {
      useIdeStore.getState().openThread(workspaceId, agentId, threadId);
      useDeskStore.getState().setFocusedThreadId(threadId);
      openThread(threadId, { kind: 'agent', id: agentId }, workspaceId);
    },
    [openThread],
  );
}

/**
 * Spawn tabs have no URL form: navigating to the parent thread would let
 * ide-sync re-activate the thread tab and steal focus from the spawn tab.
 * So: store tab (upsert already activates it) + desk focus, no navigation.
 */
export function useOpenSpawnTab() {
  return useCallback((workspaceId: string, agentId: string, threadId: string, spawnId: string) => {
    useIdeStore.getState().openSpawn(workspaceId, agentId, threadId, spawnId);
    useDeskStore.getState().setFocusedThreadId(threadId);
  }, []);
}
