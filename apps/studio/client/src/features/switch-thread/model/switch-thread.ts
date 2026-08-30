import { useAgentStore } from '@/entities/agent';
import { useJournalStore } from '@/entities/journal';
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
  useJournalStore.getState().removeForThreads([threadId]);
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
  useJournalStore.getState().replaceJournal(record.id, record.journal);
  setActiveThreadId(agentId, record.id);
  return record.id;
}

export function branchThread(
  entryId: string,
  agentId: string,
  currentThreadId: string,
): string | null {
  const source = useJournalStore.getState().journalOf(currentThreadId);
  const entry = source.entries.find((item) => item.id === entryId);
  if (!entry) {
    return null;
  }
  const titleText = entry.role === 'human' && 'text' in entry ? (entry.text ?? '') : '';
  const thread = useThreadStore.getState().create(agentId, branchTitle(titleText));
  if (!thread) {
    return null;
  }
  useJournalStore.getState().copyPrefix(currentThreadId, entryId, thread.id);
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
