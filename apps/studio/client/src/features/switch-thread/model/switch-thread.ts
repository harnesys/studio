import type { SessionEvent } from '@harnesys/studio-shared';

import { useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import {
  clearActiveThreadId,
  setActiveThreadId,
  type Thread,
  toClientThread,
  useThreadStore,
} from '@/entities/thread';
import { createThreadRecord, deleteThreadRecord } from '@/shared/api';

export function threadById(threads: Thread[], threadId: string): Thread | null {
  return threads.find((thread) => thread.id === threadId) ?? null;
}

export async function closeThread(threadId: string): Promise<string | null> {
  const thread = useThreadStore.getState().byId(threadId);
  if (!thread) {
    return null;
  }
  if (thread.kind === 'schedule') {
    return threadId;
  }
  await deleteThreadRecord(threadId);
  useSessionStore.getState().removeForThreads([threadId]);
  useThreadStore.getState().remove(threadId);
  const next = useThreadStore.getState().latestForAgent(thread.agentId)?.id ?? null;
  if (next) {
    setActiveThreadId(thread.agentId, next);
  } else {
    clearActiveThreadId(thread.agentId);
  }
  return next;
}

export async function openNewThread(agentId: string, workspaceId: string): Promise<string | null> {
  const agent = useAgentStore.getState().byId(agentId);
  if (!agent) {
    return null;
  }
  const record = await createThreadRecord({ workspaceId, agentId: agent.id });
  useThreadStore.getState().upsert(toClientThread(record));
  useSessionStore.getState().replaceEvents(record.id, record.events);
  setActiveThreadId(agentId, record.id);
  return record.id;
}

/** Create a child thread linked at forkAt. Does not copy parent events. */
export async function branchThread(
  forkAt: string,
  agentId: string,
  currentThreadId: string,
  workspaceId: string,
): Promise<string | null> {
  const parent = useThreadStore.getState().byId(currentThreadId);
  if (!parent) {
    return null;
  }
  const agent = useAgentStore.getState().byId(agentId);
  if (!agent) {
    return null;
  }
  const events = useSessionStore.getState().eventsOf(currentThreadId);
  const record = await createThreadRecord({
    workspaceId,
    agentId: agent.id,
    originAgentId: agent.id,
    title: branchTitle(titleSource(events, forkAt)),
    parentThreadId: currentThreadId,
    forkAt,
  });
  const thread = toClientThread(record);
  useThreadStore.getState().upsert(thread);
  useSessionStore.getState().replaceEvents(record.id, record.events);
  setActiveThreadId(agent.id, thread.id);
  return thread.id;
}

function titleSource(events: SessionEvent[], forkAt: string): string {
  for (const event of events) {
    if ('id' in event && event.id === forkAt && 'text' in event && typeof event.text === 'string') {
      return event.text;
    }
  }
  const fromRun = events
    .filter((event) => event.runId === forkAt && event.type === 'text-delta')
    .map((event) => ('text' in event ? event.text : ''))
    .join('');
  return fromRun;
}

function branchTitle(content: string): string {
  const compact = content.trim().replace(/\s+/g, ' ');
  if (compact.length <= 28) {
    return compact || 'Branch';
  }
  return `${compact.slice(0, 28).trimEnd()}…`;
}
