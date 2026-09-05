import { useEffect, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router';

import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { useWorkspaces } from '@/entities/workspace';
import { watchDesk } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';

import { applyDeskEvent } from '../model/apply-desk-event';
import { useDeskStore } from '../model/desk.store';
import { hydrateDesk } from '../model/hydrate-desk';

export function DeskSync() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { surface, threadId, threadOrigin, originEntityId } = useStudioLocation();
  const workspacesQuery = useWorkspaces();
  const hydratedWorkspaceId = useDeskStore((state) => state.hydratedWorkspaceId);

  useLayoutEffect(() => {
    if (!workspaceId) {
      return;
    }
    useDeskStore.getState().setHydratedWorkspaceId(null);
    void hydrateDesk(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    return watchDesk(workspaceId, applyDeskEvent);
  }, [workspaceId]);

  useEffect(() => {
    if (
      !workspaceId ||
      workspacesQuery.status === 'pending' ||
      hydratedWorkspaceId !== workspaceId
    ) {
      return;
    }
    const hasWorkspace = workspacesQuery.data?.some((item) => item.id === workspaceId) ?? false;
    if (!hasWorkspace) {
      return;
    }
    const threads = useThreadStore
      .getState()
      .items.filter((item) => item.workspaceId === workspaceId);

    if (surface === 'thread' && threadId) {
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) {
        // Битый URL треда (все треды удалены): уводим на лендинг агента
        // с кнопкой New thread, а не на пустой воркспейс.
        const fallback = fallbackAgentId(workspaceId, threadOrigin, originEntityId);
        if (fallback) {
          void navigate(studioPath.agent(workspaceId, fallback), { replace: true });
        } else {
          void navigate(studioPath.workspace(workspaceId), { replace: true });
        }
      }
      return;
    }
  }, [
    workspaceId,
    surface,
    threadId,
    threadOrigin,
    originEntityId,
    hydratedWorkspaceId,
    workspacesQuery.status,
    workspacesQuery.data,
    navigate,
  ]);

  return null;
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
    agents.length === 1 ? (agents[0]?.id ?? null) : null,
  ];
  return candidates.find((id) => id && known.has(id)) ?? null;
}
