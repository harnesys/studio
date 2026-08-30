import { useEffect, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router';

import { useAgentStore } from '@/entities/agent';
import { useScheduleStore } from '@/entities/schedule';
import {
  clearActiveThreadId,
  getActiveThreadId,
  setActiveThreadId,
  useThreadStore,
} from '@/entities/thread';
import { useWebhookStore } from '@/entities/webhook';
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
  const { agentId, threadId, scheduleId, webhookId } = useStudioLocation();
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
    const agents = useAgentStore
      .getState()
      .items.filter((item) => item.workspaceId === workspaceId);
    const threads = useThreadStore
      .getState()
      .items.filter((item) => item.workspaceId === workspaceId);
    const schedules = useScheduleStore
      .getState()
      .items.filter((item) => item.workspaceId === workspaceId);
    const webhooks = useWebhookStore
      .getState()
      .items.filter((item) => item.workspaceId === workspaceId);

    if (agentId && !agents.some((item) => item.id === agentId)) {
      void navigate(studioPath.workspace(workspaceId), { replace: true });
      return;
    }
    if (threadId && !threads.some((item) => item.id === threadId)) {
      if (agentId) {
        clearActiveThreadId(agentId);
      }
      void navigate(studioPath.workspaceAgent(workspaceId, agentId ?? ''), { replace: true });
      return;
    }
    if (scheduleId && !schedules.some((item) => item.id === scheduleId)) {
      void navigate(studioPath.schedules(workspaceId), { replace: true });
      return;
    }
    if (webhookId && !webhooks.some((item) => item.id === webhookId)) {
      void navigate(studioPath.webhooks(workspaceId), { replace: true });
      return;
    }
    if (agentId && !threadId) {
      const agentThreads = threads.filter((item) => item.agentId === agentId);
      if (agentThreads.length > 0) {
        const storedId = getActiveThreadId(agentId);
        const target =
          (storedId ? agentThreads.find((item) => item.id === storedId) : undefined) ??
          useThreadStore.getState().latestForAgent(agentId);
        if (target) {
          void navigate(studioPath.workspaceThread(workspaceId, agentId, target.id), {
            replace: true,
          });
          return;
        }
      }
    }
    if (
      agentId &&
      threadId &&
      threads.some((item) => item.id === threadId && item.agentId === agentId)
    ) {
      setActiveThreadId(agentId, threadId);
      useDeskStore.getState().setFocusedThreadId(threadId);
    }
  }, [
    workspaceId,
    hydratedWorkspaceId,
    workspacesQuery.status,
    workspacesQuery.data,
    agentId,
    threadId,
    scheduleId,
    webhookId,
    navigate,
  ]);

  return null;
}
