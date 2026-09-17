import type { DeskEvent } from '@harnesys/studio-shared';
import { toClientAgent, useAgentStore } from '@/entities/agent';
import { usePlanStore } from '@/entities/plan';
import { toClientSchedule, useScheduleStore } from '@/entities/schedule';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { toClientWebhook, useWebhookStore } from '@/entities/webhook';
import { useAgentsDisplayStore } from './agents-display.store';
import { useDeskStore } from './desk.store';

export function applyDeskEvent(event: DeskEvent): void {
  switch (event.type) {
    case 'agent': {
      useAgentStore.getState().upsert(toClientAgent(event.agent));
      return;
    }
    case 'agent-deleted': {
      dropAgent(event.id);
      return;
    }
    case 'thread': {
      useThreadStore.getState().upsert(toClientThread(event.thread));
      if (!useSessionStore.getState().activeRuns[event.thread.id]) {
        useSessionStore.getState().replaceEvents(event.thread.id, event.thread.events);
      }
      return;
    }
    case 'plan': {
      usePlanStore.getState().upsert(event.plan);
      return;
    }
    case 'plan-deleted': {
      usePlanStore.getState().removeForThread(event.threadId);
      return;
    }
    case 'schedule-deleted': {
      dropSchedule(event.id);
      return;
    }
    case 'schedule': {
      const previous = useScheduleStore.getState().byId(event.schedule.id);
      if (previous && previous.threadId !== event.schedule.threadId) {
        dropOwnedTriggerThread(previous.threadId);
      }
      useScheduleStore.getState().upsert(toClientSchedule(event.schedule));
      return;
    }
    case 'webhook-deleted': {
      const current = useWebhookStore.getState().byId(event.id);
      useWebhookStore.getState().remove(event.id);
      if (current) {
        dropOwnedTriggerThread(current.threadId);
      }
      return;
    }
    case 'webhook': {
      const previous = useWebhookStore.getState().byId(event.webhook.id);
      if (previous && previous.threadId !== event.webhook.threadId) {
        dropOwnedTriggerThread(previous.threadId);
      }
      useWebhookStore.getState().upsert(toClientWebhook(event.webhook));
      return;
    }
    case 'run-finish': {
      // Server-side lifecycle signal (monitor jobs, run hook buses); desk
      // state updates arrive through thread events.
      return;
    }
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return;
    }
  }
}

function dropSchedule(id: string): void {
  const current = useScheduleStore.getState().byId(id);
  useScheduleStore.getState().remove(id);
  if (current) {
    dropOwnedTriggerThread(current.threadId);
  }
}

function dropAgent(agentId: string): void {
  const threadIds = useThreadStore
    .getState()
    .items.filter((item) => item.agentId === agentId)
    .map((item) => item.id);
  useSessionStore.getState().removeForThreads(threadIds);
  for (const threadId of threadIds) {
    usePlanStore.getState().removeForThread(threadId);
    useThreadStore.getState().remove(threadId);
  }
  useAgentStore.getState().remove(agentId);
  const desk = useDeskStore.getState();
  if (desk.focusedThreadId && threadIds.includes(desk.focusedThreadId)) {
    desk.setFocusedThreadId(null);
  }
  useAgentsDisplayStore.getState().forget(agentId);
}

function dropOwnedTriggerThread(threadId: string): void {
  const thread = useThreadStore.getState().byId(threadId);
  if (thread?.kind !== 'schedule' && thread?.kind !== 'webhook') {
    return;
  }
  useSessionStore.getState().removeForThreads([threadId]);
  usePlanStore.getState().removeForThread(threadId);
  useThreadStore.getState().remove(threadId);
}
