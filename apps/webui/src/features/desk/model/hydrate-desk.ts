import { toClientAgent, useAgentStore } from '@/entities/agent';
import { toClientSchedule, useScheduleStore } from '@/entities/schedule';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { toClientWebhook, useWebhookStore } from '@/entities/webhook';
import { listAgents, listSchedules, listThreads, listWebhooks } from '@/shared/api';
import { rememberRunNode, rememberThreadNode } from '@/shared/api/host-router';
import { useDeskStore } from './desk.store';

const inflight = new Map<string, Promise<void>>();
export function hydrateDesk(workspaceId: string): Promise<void> {
  if (useDeskStore.getState().hydrated[workspaceId] === 'ready') {
    return Promise.resolve();
  }
  const running = inflight.get(workspaceId);
  if (running) {
    return running;
  }
  useDeskStore.getState().setHydrateStatus(workspaceId, 'pending');
  const task = loadDesk(workspaceId)
    .then(() => {
      useDeskStore.getState().setHydrateStatus(workspaceId, 'ready');
    })
    .catch((error: unknown) => {
      useDeskStore.getState().setHydrateStatus(workspaceId, null);
      throw error;
    })
    .finally(() => {
      if (inflight.get(workspaceId) === task) {
        inflight.delete(workspaceId);
      }
    });
  inflight.set(workspaceId, task);
  return task;
}
async function loadDesk(workspaceId: string): Promise<void> {
  const [agents, summaries, schedules, webhooks] = await Promise.all([
    listAgents(workspaceId),
    listThreads(workspaceId),
    listSchedules(workspaceId),
    listWebhooks(workspaceId),
  ]);
  useAgentStore.getState().replaceWorkspace(workspaceId, agents.map(toClientAgent));
  const threads = summaries.map(toClientThread);
  useThreadStore.getState().replaceWorkspace(workspaceId, threads);
  useScheduleStore.getState().replaceWorkspace(workspaceId, schedules.map(toClientSchedule));
  useWebhookStore.getState().replaceWorkspace(workspaceId, webhooks.map(toClientWebhook));
  for (const thread of threads) {
    rememberThreadNode(thread.id, workspaceId);
    if (thread.activeRunId) {
      rememberRunNode(thread.activeRunId, workspaceId);
    }
  }
}
