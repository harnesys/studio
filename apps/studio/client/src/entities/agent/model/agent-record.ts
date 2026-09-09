import { type AgentRecord, defaultAgentCompaction } from '@studio/shared';

import { type Agent, initialsFromName } from './agent';

export function toClientAgent(record: AgentRecord): Agent {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    modelId: record.modelId ?? null,
    role: record.role,
    instructions: record.instructions,
    effort: record.effort ?? null,
    generation: record.generation ?? null,
    toolOutput: record.toolOutput ?? null,
    budget: record.budget ?? null,
    compaction: record.compaction === undefined ? defaultAgentCompaction() : record.compaction,
    skills: record.skills ?? [],
    mcpServers: record.mcpServers ?? [],
    tools: record.tools ?? [],
    graph: record.graph ?? { nodes: {}, edges: [] },
    capabilities: record.capabilities ?? {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: 'idle',
    initials: initialsFromName(record.name),
    currentTask: record.modelId ? 'Ready.' : 'Pick a model to chat.',
    lastActiveAt: new Date().toISOString(),
  };
}
