import type { SessionEvent } from '@harnesys/studio-shared';
import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { useScheduleStore } from '@/entities/schedule';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore } from '@/entities/webhook';
import { useWorkspaces } from '@/entities/workspace';
import {
  studioFocusThreadId,
  studioFocusWorkspaceId,
  useStudioLocation,
} from '@/shared/config/location';

import { useDeskStore } from './desk.store';
import { isWaiting } from './use-agent-live-status';

const EMPTY_EVENTS: SessionEvent[] = [];

export function useDeskSelection() {
  return useDeskStore(
    useShallow((state) => ({
      inspectorTab: state.inspectorTab,
      inspectorOpen: state.inspectorOpen,
    })),
  );
}

export function useWorkspaceAgents(workspaceId: string | null) {
  return useAgentStore(
    useShallow((state) =>
      workspaceId ? state.items.filter((item) => item.workspaceId === workspaceId) : [],
    ),
  );
}

export function useAgentsInWorkspaces(workspaceIds: string[]) {
  return useAgentStore(
    useShallow((state) => state.items.filter((item) => workspaceIds.includes(item.workspaceId))),
  );
}

export function useAgentThreads(agentId: string | null) {
  return useThreadStore(useShallow((state) => (agentId ? state.forAgent(agentId) : [])));
}

export function useThreadEvents(threadId: string | null) {
  return useSessionStore((state) => {
    if (!threadId) {
      return EMPTY_EVENTS;
    }
    return state.events[threadId] ?? EMPTY_EVENTS;
  });
}

export function useWorkspaceSchedules(workspaceId: string | null) {
  return useScheduleStore(
    useShallow((state) =>
      workspaceId ? state.items.filter((item) => item.workspaceId === workspaceId) : [],
    ),
  );
}

export function useSchedulesInWorkspaces(workspaceIds: string[]) {
  return useScheduleStore(
    useShallow((state) => state.items.filter((item) => workspaceIds.includes(item.workspaceId))),
  );
}

export function useWorkspaceWebhooks(workspaceId: string | null) {
  return useWebhookStore(
    useShallow((state) =>
      workspaceId ? state.items.filter((item) => item.workspaceId === workspaceId) : [],
    ),
  );
}

export function useWebhooksInWorkspaces(workspaceIds: string[]) {
  return useWebhookStore(
    useShallow((state) => state.items.filter((item) => workspaceIds.includes(item.workspaceId))),
  );
}

/** Threads with a pending ask or wait across the given workspaces (inbox rows). */
export function useWaitingThreads(workspaceIds: string[]) {
  const items = useThreadStore(useShallow((state) => state.items));
  return useSessionStore(
    useShallow((state) =>
      items.filter(
        (item) =>
          workspaceIds.includes(item.workspaceId ?? '') && isWaiting(state.events[item.id] ?? []),
      ),
    ),
  );
}

export function useSelectedAgent() {
  const focus = useStudioLocation();
  const workspaceId = studioFocusWorkspaceId(focus);
  const threadId = studioFocusThreadId(focus);
  const scheduleId = focus.kind === 'schedule' ? focus.scheduleId : null;
  const webhookId = focus.kind === 'webhook' ? focus.webhookId : null;
  const agents = useWorkspaceAgents(workspaceId);
  const thread = useThreadStore(
    useShallow((state) => (threadId ? (state.byId(threadId) ?? null) : null)),
  );
  const schedule = useScheduleStore(
    useShallow((state) =>
      scheduleId ? (state.items.find((item) => item.id === scheduleId) ?? null) : null,
    ),
  );
  const webhook = useWebhookStore(
    useShallow((state) =>
      webhookId ? (state.items.find((item) => item.id === webhookId) ?? null) : null,
    ),
  );
  if (thread) {
    return agents.find((item) => item.id === thread.agentId) ?? null;
  }
  if (schedule) {
    return agents.find((item) => item.id === schedule.targetAgentId) ?? null;
  }
  if (webhook) {
    return agents.find((item) => item.id === webhook.targetAgentId) ?? null;
  }
  return null;
}

export function useSelectedThread() {
  const focus = useStudioLocation();
  const threadId = studioFocusThreadId(focus);
  const scheduleId = focus.kind === 'schedule' ? focus.scheduleId : null;
  const webhookId = focus.kind === 'webhook' ? focus.webhookId : null;
  const focusedThreadId = useDeskStore((state) => state.focusedThreadId);
  const scheduleThreadId = useScheduleStore((state) =>
    scheduleId ? (state.items.find((item) => item.id === scheduleId)?.threadId ?? null) : null,
  );
  const webhookThreadId = useWebhookStore((state) =>
    webhookId ? (state.items.find((item) => item.id === webhookId)?.threadId ?? null) : null,
  );
  const preferredId = threadId ?? scheduleThreadId ?? webhookThreadId ?? focusedThreadId;
  return useThreadStore(
    useShallow((state) => (preferredId ? (state.byId(preferredId) ?? null) : null)),
  );
}

export function useDesk() {
  const focus = useStudioLocation();
  const workspaceId = studioFocusWorkspaceId(focus);
  const workspacesQuery = useWorkspaces();
  const desk = useDeskSelection();
  const agents = useWorkspaceAgents(workspaceId);
  const agent = useSelectedAgent();
  const threads = useAgentThreads(agent?.id ?? null);
  const thread = useSelectedThread();
  const events = useThreadEvents(thread?.id ?? null);
  const schedules = useWorkspaceSchedules(workspaceId);
  const webhooks = useWorkspaceWebhooks(workspaceId);

  return {
    workspaceId,
    focus,
    workspace: workspacesQuery.data?.find((item) => item.id === workspaceId) ?? null,
    workspaces: workspacesQuery.data ?? [],
    workspacesStatus: workspacesQuery.status,
    agents,
    agent,
    threads,
    thread,
    events,
    schedules,
    webhooks,
    inspectorTab: desk.inspectorTab,
    inspectorOpen: desk.inspectorOpen,
  };
}
