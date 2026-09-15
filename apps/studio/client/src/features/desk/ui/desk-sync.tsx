import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';

import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { useWorkspaces } from '@/entities/workspace';
import { watchDesk } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';

import { useAgentsDisplayStore } from '../model/agents-display.store';
import { useAgentsSlideStore } from '../model/agents-slide.store';
import { applyDeskEvent } from '../model/apply-desk-event';
import { useDeskStore } from '../model/desk.store';
import { hydrateDesk } from '../model/hydrate-desk';

export function DeskSync() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { surface, threadId, threadOrigin, originEntityId, agentId } = useStudioLocation();
  const workspacesQuery = useWorkspaces();
  const workspaceIds = useMemo(
    () => workspacesQuery.data?.map((item) => item.id) ?? [],
    [workspacesQuery.data],
  );
  const visibleReady = useDeskStore((state) =>
    workspaceId ? state.hydrated[workspaceId] === 'ready' : false,
  );

  useLayoutEffect(() => {
    if (!workspaceId) {
      return;
    }
    void hydrateDesk(workspaceId).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    if (workspacesQuery.status !== 'success') {
      return;
    }
    for (const id of workspaceIds) {
      void hydrateDesk(id).catch(() => {});
    }
    const known = new Set(workspaceIds);
    for (const id of Object.keys(useDeskStore.getState().hydrated)) {
      if (!known.has(id)) {
        useDeskStore.getState().setHydrateStatus(id, null);
      }
    }
  }, [workspaceIds, workspacesQuery.status]);

  useEffect(() => {
    return watchDesk(applyDeskEvent);
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

    if (surface === 'agent' && agentId) {
      revealAgent(agentId);
      void navigate(studioPath.workspace(workspaceId), { replace: true });
      return;
    }

    if (surface === 'thread' && threadId) {
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) {
        const fallback = fallbackAgentId(workspaceId, threadOrigin, originEntityId);
        if (fallback) {
          revealAgent(fallback);
        }
        void navigate(studioPath.workspace(workspaceId), { replace: true });
      }
    }
  }, [
    workspaceId,
    surface,
    threadId,
    agentId,
    threadOrigin,
    originEntityId,
    visibleReady,
    workspacesQuery.status,
    workspacesQuery.data,
    navigate,
  ]);

  return null;
}

function revealAgent(agentId: string): void {
  if (useAgentsDisplayStore.getState().mode === 'inline') {
    useAgentsDisplayStore.getState().expand(agentId);
  } else {
    useAgentsSlideStore.getState().open(agentId);
  }
}

function fallbackAgentId(
  workspaceId: string,
  threadOrigin: string | null,
  originEntityId: string | null,
): string | null {
  const agents = useAgentStore.getState().items.filter((item) => item.workspaceId === workspaceId);
  const known = new Set(agents.map((item) => item.id));
  const focusedThreadId = useDeskStore.getState().focusedThreadId;
  const focusedThread = focusedThreadId
    ? (useThreadStore.getState().byId(focusedThreadId) ?? null)
    : null;
  const candidates = [
    threadOrigin === 'agent' ? originEntityId : null,
    focusedThread?.agentId ?? null,
    focusedThread?.originAgentId ?? null,
    agents.length === 1 ? (agents[0]?.id ?? null) : null,
  ];
  return candidates.find((id) => id && known.has(id)) ?? null;
}
