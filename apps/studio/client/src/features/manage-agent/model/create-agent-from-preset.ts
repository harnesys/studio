import { defaultAgentCompaction } from '@harnesys/studio-shared';
import { type Agent, initialsFromName, toClientAgent, useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { type Thread, toClientThread, useThreadStore } from '@/entities/thread';
import { createAgentFromPresetRecord, createThreadRecord } from '@/shared/api';
import type { AgentPresetRecord } from '@/shared/api/agents';

import { refreshWorkspaceAgents } from './create-agent';

export type CreateAgentFromPresetResult = {
  agent: Agent;
  thread: Thread | null;
};

/** Synthetic agent-shaped draft: feeds AgentConfigDialog prefill; never persisted. */
export function agentDraftFromPreset(preset: AgentPresetRecord): Agent {
  return {
    id: '',
    name: preset.name,
    workspaceId: '',
    parentId: null,
    modelId: null,
    role: preset.role,
    instructions: preset.instructions,
    effort: null,
    generation: null,
    toolOutput: null,
    budget: preset.budget ?? null,
    compaction: defaultAgentCompaction(),
    skills: preset.skills ?? [],
    mcpServers: preset.mcpServers ?? [],
    tools: preset.tools ?? [],
    graph: { nodes: {}, edges: [] },
    capabilities: preset.capabilities ?? {},
    defaultModeId: null,
    modes: [],
    createdAt: '',
    updatedAt: '',
    status: 'idle',
    initials: initialsFromName(preset.name),
    lastActiveAt: '',
    currentTask: '',
  };
}

export async function createAgentFromPreset(
  workspaceId: string,
  presetId: string,
  options?: { parentId?: string | null },
): Promise<CreateAgentFromPresetResult | null> {
  if (!workspaceId || !presetId) {
    return null;
  }
  const record = await createAgentFromPresetRecord(workspaceId, presetId, options);
  const agent = toClientAgent(record);
  useAgentStore.getState().upsert(agent);
  // Seeds (Explorer/General under Assistant, etc.) land in the same request on the server.
  await refreshWorkspaceAgents(workspaceId);

  if (agent.parentId) {
    return { agent, thread: null };
  }

  const threadRecord = await createThreadRecord({ workspaceId, agentId: record.id });
  const thread = toClientThread(threadRecord);
  useThreadStore.getState().upsert(thread);
  useSessionStore.getState().replaceEvents(threadRecord.id, threadRecord.events);
  return { agent, thread };
}
