import { type Agent, type AgentDraft, toClientAgent, useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { type Thread, toClientThread, useThreadStore } from '@/entities/thread';
import { createAgentRecord, createThreadRecord } from '@/shared/api';

export type CreateAgentResult = {
  agent: Agent;
  thread: Thread;
};

export async function createAgent(
  workspaceId: string,
  draft: AgentDraft,
): Promise<CreateAgentResult | null> {
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
    budget: draft.budget ?? null,
  });
  const agent = toClientAgent(record);
  useAgentStore.getState().upsert(agent);
  const threadRecord = await createThreadRecord({ workspaceId, agentId: record.id });
  const thread = toClientThread(threadRecord);
  useThreadStore.getState().upsert(thread);
  useSessionStore.getState().replaceEvents(threadRecord.id, threadRecord.events);
  return { agent, thread };
}
