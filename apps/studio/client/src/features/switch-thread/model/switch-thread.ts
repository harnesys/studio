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

export function branchThread(
  entryId: string,
  agentId: string,
  currentThreadId: string,
): string | null {
  const events = useSessionStore.getState().eventsOf(currentThreadId);
  if (events.length === 0) {
    return null;
  }
  const thread = useThreadStore.getState().create(agentId, branchTitle(''));
  if (!thread) {
    return null;
  }
  useSessionStore.getState().copyEvents(currentThreadId, thread.id);
  setActiveThreadId(agentId, thread.id);
  return thread.id;
}

function branchTitle(content: string): string {
  const compact = content.trim().replace(/\s+/g, ' ');
  if (compact.length <= 28) {
    return compact || 'Branch';
  }
  return `${compact.slice(0, 28).trimEnd()}…`;
}
