import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useScheduleStore } from '@/entities/schedule';
import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useWebhookStore } from '@/entities/webhook';
import { useDeskStore, useSelectedWorkspaceIds, useWorkspaceTabsStore } from '@/features/desk';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { useIdeStore } from './ide.store';
import { normalizeIdeFilePath, tabIdFor } from './ide-persist';
import { pathForIdeTab } from './open-ide';

function deskVisibleIds(selectedIds: string[], workspaceId: string): string[] {
  return selectedIds.includes(workspaceId) ? selectedIds : [...selectedIds, workspaceId];
}

/**
 * Active visible tab ↔ URL. Deep link adds workspace to selection, opens tab.
 * Primary schedule/webhook threads on /thread/... redirect to automation URLs.
 */
export function useIdeSync() {
  const navigate = useNavigate();
  const focus = useStudioLocation();
  const selectedIds = useSelectedWorkspaceIds();
  const workspaceId = focus.kind === 'none' || focus.kind === 'settings' ? null : focus.workspaceId;
  const deskReady = useDeskStore((state) =>
    workspaceId ? state.hydrated[workspaceId] === 'ready' : false,
  );

  useEffect(() => {
    if (!workspaceId || focus.kind === 'none' || focus.kind === 'settings') {
      return;
    }
    useWorkspaceTabsStore.getState().add(workspaceId);
  }, [workspaceId, focus.kind]);

  useEffect(() => {
    if (!workspaceId || !deskReady) {
      return;
    }
    const visible = deskVisibleIds(selectedIds, workspaceId);

    if (focus.kind === 'file') {
      useIdeStore.getState().openFile(workspaceId, focus.path);
      useIdeStore
        .getState()
        .setDeskActive(workspaceId, tabIdFor('file', normalizeIdeFilePath(focus.path)), visible);
      return;
    }

    if (focus.kind === 'diff') {
      useIdeStore.getState().openDiff(workspaceId, focus.path);
      useIdeStore
        .getState()
        .setDeskActive(workspaceId, tabIdFor('diff', normalizeIdeFilePath(focus.path)), visible);
      return;
    }

    if (focus.kind === 'schedule') {
      const schedule = useScheduleStore
        .getState()
        .items.find((item) => item.id === focus.scheduleId);
      if (!schedule || schedule.workspaceId !== workspaceId) {
        return;
      }
      useIdeStore
        .getState()
        .openSchedule(workspaceId, schedule.id, schedule.threadId, schedule.targetAgentId);
      useDeskStore.getState().setFocusedThreadId(schedule.threadId);
      setActiveThreadId(schedule.targetAgentId, schedule.threadId);
      useIdeStore.getState().setDeskActive(workspaceId, tabIdFor('schedule', schedule.id), visible);
      return;
    }

    if (focus.kind === 'webhook') {
      const webhook = useWebhookStore.getState().items.find((item) => item.id === focus.webhookId);
      if (!webhook || webhook.workspaceId !== workspaceId) {
        return;
      }
      useIdeStore
        .getState()
        .openWebhook(workspaceId, webhook.id, webhook.threadId, webhook.targetAgentId);
      useDeskStore.getState().setFocusedThreadId(webhook.threadId);
      setActiveThreadId(webhook.targetAgentId, webhook.threadId);
      useIdeStore.getState().setDeskActive(workspaceId, tabIdFor('webhook', webhook.id), visible);
      return;
    }

    if (focus.kind === 'spawn') {
      const thread = useThreadStore.getState().byId(focus.threadId);
      if (!thread) {
        return;
      }
      useIdeStore.getState().openSpawn(workspaceId, thread.agentId, focus.threadId, focus.spawnId);
      useDeskStore.getState().setFocusedThreadId(focus.threadId);
      useIdeStore
        .getState()
        .setDeskActive(
          workspaceId,
          tabIdFor('spawn', `${focus.threadId}:${focus.spawnId}`),
          visible,
        );
      return;
    }

    if (focus.kind === 'thread') {
      const thread = useThreadStore.getState().byId(focus.threadId);
      if (!thread) {
        return;
      }

      if (thread.kind === 'schedule') {
        const schedule = useScheduleStore
          .getState()
          .items.find(
            (item) => item.threadId === focus.threadId && item.workspaceId === workspaceId,
          );
        if (schedule) {
          void navigate(studioPath.schedule(workspaceId, schedule.id), { replace: true });
          return;
        }
      }
      if (thread.kind === 'webhook') {
        const webhook = useWebhookStore
          .getState()
          .items.find(
            (item) => item.threadId === focus.threadId && item.workspaceId === workspaceId,
          );
        if (webhook) {
          void navigate(studioPath.webhook(workspaceId, webhook.id), { replace: true });
          return;
        }
      }

      useIdeStore.getState().openThread(workspaceId, thread.agentId, focus.threadId);
      if (useDeskStore.getState().focusedThreadId !== focus.threadId) {
        useDeskStore.getState().setFocusedThreadId(focus.threadId);
      }
      setActiveThreadId(thread.agentId, focus.threadId);
      useIdeStore
        .getState()
        .setDeskActive(workspaceId, tabIdFor('thread', focus.threadId), visible);
    }
  }, [workspaceId, focus, deskReady, selectedIds, navigate]);
}

/** After toggle-off of the workspace that owned the active tab, rewrite URL. */
export function navigateAfterPark(
  navigate: (to: string) => void,
  removedWorkspaceId: string,
  remainingIds: string[],
): void {
  const byWorkspace = useIdeStore.getState().byWorkspace;
  for (const id of remainingIds) {
    const ws = byWorkspace[id];
    if (!ws?.activeId) {
      continue;
    }
    const tab = ws.tabs.find((item) => item.id === ws.activeId);
    if (!tab) {
      continue;
    }
    const path = pathForIdeTab(id, tab);
    if (path) {
      navigate(path);
      return;
    }
  }
  for (const id of remainingIds) {
    const ws = byWorkspace[id];
    const tab = ws?.tabs[ws.tabs.length - 1];
    if (!tab) {
      continue;
    }
    useIdeStore.getState().setDeskActive(id, tab.id, remainingIds);
    const path = pathForIdeTab(id, tab);
    if (path) {
      navigate(path);
      return;
    }
  }
  void removedWorkspaceId;
  navigate(studioPath.desk);
}
