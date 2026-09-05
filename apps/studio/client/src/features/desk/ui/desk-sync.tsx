import { useEffect, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router';

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
  const { surface, threadId, agentId } = useStudioLocation();
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
        void navigate(studioPath.workspace(workspaceId), { replace: true });
      }
      return;
    }
    if (surface === 'agent' && agentId) {
      const agentThreads = threads.filter((item) => item.agentId === agentId);
      if (agentThreads.length === 0) {
        void navigate(studioPath.workspace(workspaceId), { replace: true });
      }
    }
  }, [
    workspaceId,
    surface,
    threadId,
    agentId,
    hydratedWorkspaceId,
    workspacesQuery.status,
    workspacesQuery.data,
    navigate,
  ]);

  return null;
}
