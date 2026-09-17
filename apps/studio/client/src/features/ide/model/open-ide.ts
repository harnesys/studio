import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { useDeskStore } from '@/features/desk';
import { useStudioNavigation } from '@/shared/config/navigation';
import { studioPath } from '@/shared/config/routes';

import type { IdeTab } from './ide.store';
import { useIdeStore } from './ide.store';

export function pathForIdeTab(workspaceId: string, tab: IdeTab): string | null {
  if (tab.kind === 'thread' && tab.threadId) {
    return studioPath.thread(workspaceId, tab.threadId);
  }
  if (tab.kind === 'file' && tab.path) {
    return studioPath.file(workspaceId, tab.path);
  }
  if (tab.kind === 'diff' && tab.path) {
    return studioPath.diff(workspaceId, tab.path);
  }
  if (tab.kind === 'schedule' && tab.scheduleId) {
    return studioPath.schedule(workspaceId, tab.scheduleId);
  }
  if (tab.kind === 'webhook' && tab.webhookId) {
    return studioPath.webhook(workspaceId, tab.webhookId);
  }
  if (tab.kind === 'spawn' && tab.threadId && tab.spawnId) {
    return studioPath.spawn(workspaceId, tab.threadId, tab.spawnId);
  }
  if (tab.kind === 'terminal' && tab.terminalSessionId) {
    return studioPath.terminal(workspaceId, tab.terminalSessionId);
  }
  return null;
}

export function useOpenIdeTab() {
  const navigate = useNavigate();
  return (workspaceId: string, tab: IdeTab) => {
    const path = pathForIdeTab(workspaceId, tab);
    if (path) {
      void navigate(path);
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
      openThread(workspaceId, threadId);
    },
    [openThread],
  );
}

export function useOpenSpawnTab() {
  const { openSpawn } = useStudioNavigation();
  return useCallback(
    (workspaceId: string, agentId: string, threadId: string, spawnId: string) => {
      useIdeStore.getState().openSpawn(workspaceId, agentId, threadId, spawnId);
      useDeskStore.getState().setFocusedThreadId(threadId);
      openSpawn(workspaceId, threadId, spawnId);
    },
    [openSpawn],
  );
}

export function useOpenTerminalTab() {
  const { openTerminal } = useStudioNavigation();
  return useCallback(
    (workspaceId: string, sessionId: string) => {
      useIdeStore.getState().openTerminal(workspaceId, sessionId);
      openTerminal(workspaceId, sessionId);
    },
    [openTerminal],
  );
}
