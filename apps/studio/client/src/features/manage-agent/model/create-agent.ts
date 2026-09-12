import { type Agent, type AgentDraft, toClientAgent, useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { type Thread, toClientThread, useThreadStore } from '@/entities/thread';
import { createAgentRecord, createThreadRecord, listAgents } from '@/shared/api';

export type CreateAgentResult = {
  agent: Agent;
  thread: Thread | null;
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
    parentId: draft.parentId ?? undefined,
    role: draft.role,
    instructions: draft.instructions,
    modelId: draft.modelId,
    effort: draft.effort ?? null,
    generation: draft.generation ?? null,
    toolOutput: draft.toolOutput ?? null,
    budget: draft.budget ?? null,
    capabilities: draft.capabilities,
    defaultModeId: draft.defaultModeId ?? null,
    // Empty list = let the server seed installedByDefault presets + ask (Decision 3).
    ...(draft.modes?.length ? { modes: draft.modes } : {}),
    ...(draft.graph !== undefined ? { graph: draft.graph } : {}),
  });
  const agent = toClientAgent(record);
  useAgentStore.getState().upsert(agent);

  if (agent.parentId) {
    return { agent, thread: null };
  }

  const threadRecord = await createThreadRecord({ workspaceId, agentId: record.id });
  const thread = toClientThread(threadRecord);
  useThreadStore.getState().upsert(thread);
  useSessionStore.getState().replaceEvents(threadRecord.id, threadRecord.events);
  return { agent, thread };
}

/** Reload all agents for a workspace into the client store (picks up seeded delegates). */
export async function refreshWorkspaceAgents(workspaceId: string): Promise<Agent[]> {
  const records = await listAgents(workspaceId);
  const agents = records.map(toClientAgent);
  useAgentStore.getState().replaceWorkspace(workspaceId, agents);
  return agents;
}
