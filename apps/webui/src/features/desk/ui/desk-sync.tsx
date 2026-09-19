import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';

import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { useWorkspaces } from '@/entities/workspace';
import { watchDesk } from '@/shared/api';
import {
  listWorkspaceFilesTree,
  watchWorkspaceFiles,
  workspaceFilesTreeQueryKey,
} from '@/shared/api/files';
import { gitFileStatusQueryKey, gitStatusQueryKey } from '@/shared/api/git';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';

import { useAgentsDisplayStore } from '../model/agents-display.store';
import { applyDeskEvent } from '../model/apply-desk-event';
import { useDeskStore } from '../model/desk.store';
import { hydrateDeskChrome } from '../model/desk-chrome';
import { hydrateDesk } from '../model/hydrate-desk';
import { useSelectedWorkspaceIds, useWorkspaceTabsStore } from '../model/workspace-tabs.store';

export function DeskSync() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const focus = useStudioLocation();
  const workspaceId = studioFocusWorkspaceId(focus);
  const workspacesQuery = useWorkspaces();
  const workspaceIds = useMemo(
    () => workspacesQuery.data?.map((item) => item.id) ?? [],
    [workspacesQuery.data],
  );
  const selectedWorkspaceIds = useSelectedWorkspaceIds();
  const visibleReady = useDeskStore((state) =>
    workspaceId ? state.hydrated[workspaceId] === 'ready' : false,
  );

  useLayoutEffect(() => {
    if (!workspaceId) {
      return;
    }
    void hydrateDeskChrome()
      .then(() => {
        useWorkspaceTabsStore.getState().add(workspaceId);
      })
      .catch(() => {
        useWorkspaceTabsStore.getState().add(workspaceId);
      });
    void hydrateDesk(workspaceId).catch(() => {});
  }, [workspaceId]);

  // Only selected (on-desk) workspaces: agents/threads/tree. Off-desk stays cold.
  useEffect(() => {
    if (workspacesQuery.status !== 'success') {
      return;
    }
    const known = new Set(workspaceIds);
    const wanted = selectedWorkspaceIds.filter((id) => known.has(id));
    for (const id of wanted) {
      void hydrateDesk(id).catch(() => {});
      void queryClient.prefetchQuery({
        queryKey: workspaceFilesTreeQueryKey(id),
        queryFn: () => listWorkspaceFilesTree(id),
        staleTime: 60_000,
      });
    }
    for (const id of Object.keys(useDeskStore.getState().hydrated)) {
      if (!known.has(id)) {
        useDeskStore.getState().setHydrateStatus(id, null);
      }
    }
  }, [selectedWorkspaceIds, workspaceIds, workspacesQuery.status, queryClient]);

  useEffect(() => {
    return watchDesk(applyDeskEvent);
  }, []);

  // Layout-owned fs watch per selected workspace; toggle only adds/removes that id's stream.
  const filesWatchesRef = useRef(new Map<string, () => void>());
  useEffect(() => {
    const watches = filesWatchesRef.current;
    const wanted = new Set(selectedWorkspaceIds);
    for (const [id, unsub] of watches) {
      if (!wanted.has(id)) {
        unsub();
        watches.delete(id);
      }
    }
    for (const id of wanted) {
      if (watches.has(id)) {
        continue;
      }
      watches.set(
        id,
        watchWorkspaceFiles(id, () => {
          void queryClient.invalidateQueries({ queryKey: workspaceFilesTreeQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: gitFileStatusQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: gitStatusQueryKey(id) });
          void queryClient.invalidateQueries({
            queryKey: ['workspaces', id, 'git', 'file-status'],
          });
        }),
      );
    }
  }, [selectedWorkspaceIds, queryClient]);
  useEffect(() => {
    const watches = filesWatchesRef.current;
    return () => {
      for (const unsub of watches.values()) {
        unsub();
      }
      watches.clear();
    };
  }, []);

  useEffect(() => {
    if (!workspaceId || workspacesQuery.status === 'pending' || !visibleReady) {
      return;
    }
    const hasWorkspace = workspacesQuery.data?.some((item) => item.id === workspaceId) ?? false;
    if (!hasWorkspace) {
      return;
    }
    const threads = useThreadStore
      .getState()
      .items.filter((item) => item.workspaceId === workspaceId);

    if (focus.kind === 'thread') {
      const thread = threads.find((item) => item.id === focus.threadId);
      if (!thread) {
        const fallback = fallbackAgentId(workspaceId);
        if (fallback) {
          revealAgent(fallback);
        }
        void navigate(studioPath.desk, { replace: true });
      }
    }
  }, [workspaceId, focus, visibleReady, workspacesQuery.status, workspacesQuery.data, navigate]);

  return null;
}

function revealAgent(agentId: string): void {
  useAgentsDisplayStore.getState().expand(agentId);
}

function fallbackAgentId(workspaceId: string): string | null {
  const agents = useAgentStore.getState().items.filter((item) => item.workspaceId === workspaceId);
  const known = new Set(agents.map((item) => item.id));
  const focusedThreadId = useDeskStore.getState().focusedThreadId;
  const focusedThread = focusedThreadId
    ? (useThreadStore.getState().byId(focusedThreadId) ?? null)
    : null;
  const candidates = [
    focusedThread?.agentId ?? null,
    focusedThread?.originAgentId ?? null,
    agents.length === 1 ? (agents[0]?.id ?? null) : null,
  ];
  return candidates.find((id) => id && known.has(id)) ?? null;
}
