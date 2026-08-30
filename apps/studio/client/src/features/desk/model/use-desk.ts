import type { Journal } from '@studio/shared';
import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { useJournalStore } from '@/entities/journal';
import { useScheduleStore } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore } from '@/entities/webhook';
import { useWorkspaces } from '@/entities/workspace';
import { useStudioLocation } from '@/shared/config/location';

import { useDeskStore } from './desk.store';

const EMPTY_JOURNAL: Journal = { entries: [] };

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

export function useAgentThreads(agentId: string | null) {
  return useThreadStore(
    useShallow((state) => (agentId ? state.items.filter((item) => item.agentId === agentId) : [])),
  );
}

export function useThreadJournal(threadId: string | null) {
  return useJournalStore(
    useShallow((state) => (threadId ? (state.journals[threadId] ?? EMPTY_JOURNAL) : EMPTY_JOURNAL)),
  );
}

export function useWorkspaceSchedules(workspaceId: string | null) {
  return useScheduleStore(
    useShallow((state) =>
      workspaceId ? state.items.filter((item) => item.workspaceId === workspaceId) : [],
    ),
  );
}

export function useWorkspaceWebhooks(workspaceId: string | null) {
  return useWebhookStore(
    useShallow((state) =>
      workspaceId ? state.items.filter((item) => item.workspaceId === workspaceId) : [],
    ),
  );
}

export function useSelectedAgent() {
  const { workspaceId, agentId } = useStudioLocation();
  const agents = useWorkspaceAgents(workspaceId);
  if (!agentId) {
    return null;
  }
  return agents.find((item) => item.id === agentId) ?? null;
}

export function useSelectedThread() {
  const agent = useSelectedAgent();
  const { threadId } = useStudioLocation();
  const focusedThreadId = useDeskStore((state) => state.focusedThreadId);
  const threads = useAgentThreads(agent?.id ?? null);
  const preferredId = focusedThreadId ?? threadId;
  if (!preferredId) {
    return null;
  }
  return (
    threads.find((item) => item.id === preferredId) ??
    (threadId ? (threads.find((item) => item.id === threadId) ?? null) : null)
  );
}

export function useSelectedSchedule() {
  const { workspaceId, scheduleId } = useStudioLocation();
  const schedules = useWorkspaceSchedules(workspaceId);
  if (!scheduleId) {
    return null;
  }
  return schedules.find((item) => item.id === scheduleId) ?? null;
}

export function useSelectedWebhook() {
  const { workspaceId, webhookId } = useStudioLocation();
  const webhooks = useWorkspaceWebhooks(workspaceId);
  if (!webhookId) {
    return null;
  }
  return webhooks.find((item) => item.id === webhookId) ?? null;
}

export function useDesk() {
  const { workspaceId, surface, settingsCategory, settingsProviderId } = useStudioLocation();
  const workspacesQuery = useWorkspaces();
  const desk = useDeskSelection();
  const agents = useWorkspaceAgents(workspaceId);
  const agent = useSelectedAgent();
  const threads = useAgentThreads(agent?.id ?? null);
  const thread = useSelectedThread();
  const journal = useThreadJournal(thread?.id ?? null);
  const schedules = useWorkspaceSchedules(workspaceId);
  const schedule = useSelectedSchedule();
  const webhooks = useWorkspaceWebhooks(workspaceId);
  const webhook = useSelectedWebhook();

  return {
    workspaceId,
    surface,
    settingsCategory,
    settingsProviderId,
    workspace: workspacesQuery.data?.find((item) => item.id === workspaceId) ?? null,
    workspaces: workspacesQuery.data ?? [],
    workspacesStatus: workspacesQuery.status,
    agents,
    agent,
    threads,
    thread,
    journal,
    schedules,
    schedule,
    webhooks,
    webhook,
    inspectorTab: desk.inspectorTab,
    inspectorOpen: desk.inspectorOpen,
  };
}
