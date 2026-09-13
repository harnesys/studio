import {
  type AgentMode,
  type AgentRecord,
  DEFAULT_MODE_ID,
  defaultAgentCompaction,
  isModeId,
} from '@harnesys/studio-shared';

import { type Agent, initialsFromName } from './agent';

export function toClientAgent(record: AgentRecord): Agent {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    parentId: record.parentId ?? null,
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
    permissions: record.permissions ?? null,
    color: record.color ?? null,
    hooks: record.hooks ?? [],
    enabledPlugins: record.enabledPlugins ?? {},
    defaultModeId: record.defaultModeId ?? null,
    modes: parseModes(record.modes),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: 'idle',
    initials: initialsFromName(record.name),
    currentTask: record.modelId ? 'Ready.' : 'Pick a model to chat.',
    lastActiveAt: new Date().toISOString(),
  };
}

/** Same shape-guard as the server repo: drop malformed entries and the builtin 'ask'. */
function parseModes(modes: AgentMode[] | undefined): AgentMode[] {
  if (!Array.isArray(modes)) {
    return [];
  }
  return modes.filter(
    (mode): mode is AgentMode =>
      isModeId(mode?.id) &&
      mode.id !== DEFAULT_MODE_ID &&
      typeof mode?.name === 'string' &&
      mode.name.trim() !== '',
  );
}
