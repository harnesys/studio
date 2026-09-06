import {
  type AgentCapabilitiesPatch,
  type AgentDraft,
  toClientAgent,
  useAgentStore,
} from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { listProviders, updateAgentRecord } from '@/shared/api';

import { sanitizeForModel } from './agent-fields';

export async function updateAgent(workspaceId: string, agentId: string, draft: AgentDraft) {
  const current = useAgentStore.getState().byId(agentId);
  if (!current) {
    return;
  }

  let effort = draft.effort !== undefined ? draft.effort : current.effort;
  let generation = draft.generation !== undefined ? draft.generation : current.generation;
  const toolOutput = draft.toolOutput !== undefined ? draft.toolOutput : current.toolOutput;
  const budget = draft.budget !== undefined ? draft.budget : current.budget;

  if (draft.modelId !== current.modelId) {
    const providers = await listProviders();
    const sanitized = sanitizeForModel(draft.modelId, effort, generation, providers);
    effort = sanitized.effort;
    generation = sanitized.generation;
  }

  const record = await updateAgentRecord(workspaceId, agentId, {
    name: draft.name.trim() || current.name,
    role: draft.role,
    instructions: draft.instructions,
    modelId: draft.modelId,
    effort,
    generation,
    toolOutput,
    budget,
    ...(draft.compaction !== undefined ? { compaction: draft.compaction } : {}),
    ...(draft.memory !== undefined ? { memory: draft.memory } : {}),
  });
  const next = toClientAgent(record);
  useAgentStore.getState().upsert(next);
  if (next.name === current.name) {
    return;
  }
  useThreadStore.setState((state) => ({
    items: state.items.map((item) => (item.agentId === agentId ? { ...item } : item)),
  }));
}

export async function updateAgentCapabilities(
  workspaceId: string,
  agentId: string,
  patch: AgentCapabilitiesPatch,
) {
  const current = useAgentStore.getState().byId(agentId);
  if (!current) {
    return;
  }
  const record = await updateAgentRecord(workspaceId, agentId, patch);
  useAgentStore.getState().upsert(toClientAgent(record));
}
