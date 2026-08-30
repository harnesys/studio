import { type Agent, type AgentDraft, toClientAgent, useAgentStore } from '@/entities/agent';
import { useJournalStore } from '@/entities/journal';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { createAgentRecord, createThreadRecord } from '@/shared/api';

export async function createAgent(workspaceId: string, draft: AgentDraft): Promise<Agent | null> {
  const name = draft.name.trim();
  if (!workspaceId || !name) {
    return null;
  }
  const record = await createAgentRecord(workspaceId, {
    name,
    role: draft.role,
    instructions: draft.instructions,
    modelId: draft.modelId,
    effort: draft.effort ?? null,
    generation: draft.generation ?? null,
    toolOutput: draft.toolOutput ?? null,
  });
  const agent = toClientAgent(record);
  useAgentStore.getState().upsert(agent);
  const thread = await createThreadRecord({ workspaceId, agentId: record.id });
  useThreadStore.getState().upsert(toClientThread(thread));
  useJournalStore.getState().replaceJournal(thread.id, thread.journal);
  return agent;
}
