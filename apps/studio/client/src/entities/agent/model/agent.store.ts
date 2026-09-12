import { defaultAgentCompaction } from '@harnesys/studio-shared';
import { create } from 'zustand';

import { type Agent, type AgentDraft, type AgentPatch, initialsFromName } from './agent';

type AgentStore = {
  items: Agent[];
  byId: (id: string) => Agent | undefined;
  inWorkspace: (workspaceId: string) => Agent[];
  create: (workspaceId: string, draft: AgentDraft) => Agent | null;
  upsert: (agent: Agent) => void;
  replaceWorkspace: (workspaceId: string, agents: Agent[]) => void;
  update: (agentId: string, patch: AgentPatch) => void;
  remove: (agentId: string) => void;
};

export const useAgentStore = create<AgentStore>((set, get) => ({
  items: [],

  byId: (id) => get().items.find((item) => item.id === id),

  inWorkspace: (workspaceId) => get().items.filter((item) => item.workspaceId === workspaceId),

  create: (workspaceId, draft) => {
    const name = draft.name.trim();
    if (!workspaceId || !name) {
      return null;
    }
    const now = new Date().toISOString();
    const agent: Agent = {
      id: crypto.randomUUID(),
      workspaceId,
      parentId: draft.parentId ?? null,
      name,
      modelId: draft.modelId,
      role: draft.role.trim() || 'Operator',
      instructions: draft.instructions.trim(),
      effort: draft.effort ?? null,
      generation: draft.generation ?? null,
      toolOutput: draft.toolOutput ?? null,
      budget: draft.budget ?? null,
      compaction: draft.compaction === undefined ? defaultAgentCompaction() : draft.compaction,
      skills: [],
      mcpServers: [],
      tools: [],
      graph: draft.graph ?? { nodes: {}, edges: [] },
      capabilities: draft.capabilities ?? {},
      hooks: draft.hooks ?? [],
      enabledPlugins: draft.enabledPlugins ?? {},
      defaultModeId: draft.defaultModeId ?? null,
      modes: draft.modes ?? [],
      createdAt: now,
      updatedAt: now,
      status: 'idle',
      initials: initialsFromName(name),
      lastActiveAt: now,
      currentTask: draft.modelId ? 'Ready.' : 'Pick a model to chat.',
    };
    set((state) => ({ items: [...state.items, agent] }));
    return agent;
  },

  upsert: (agent) => {
    set((state) => ({
      items: state.items.some((item) => item.id === agent.id)
        ? state.items.map((item) => (item.id === agent.id ? agent : item))
        : [...state.items, agent],
    }));
  },

  replaceWorkspace: (workspaceId, agents) => {
    set((state) => ({
      items: [...state.items.filter((item) => item.workspaceId !== workspaceId), ...agents],
    }));
  },

  update: (agentId, patch) => {
    const current = get().items.find((agent) => agent.id === agentId);
    if (!current) {
      return;
    }
    if (patch.name !== undefined && !patch.name.trim()) {
      return;
    }
    const name = patch.name?.trim();
    set((state) => ({
      items: state.items.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              name: name ?? agent.name,
              role: patch.role !== undefined ? patch.role.trim() || agent.role : agent.role,
              instructions:
                patch.instructions !== undefined ? patch.instructions.trim() : agent.instructions,
              modelId: patch.modelId !== undefined ? patch.modelId : agent.modelId,
              compaction: patch.compaction !== undefined ? patch.compaction : agent.compaction,
              skills: patch.skills !== undefined ? patch.skills : agent.skills,
              mcpServers: patch.mcpServers !== undefined ? patch.mcpServers : agent.mcpServers,
              tools: patch.tools !== undefined ? patch.tools : agent.tools,
              graph: patch.graph !== undefined ? patch.graph : agent.graph,
              capabilities:
                patch.capabilities !== undefined ? patch.capabilities : agent.capabilities,
              defaultModeId:
                patch.defaultModeId !== undefined ? patch.defaultModeId : agent.defaultModeId,
              modes: patch.modes !== undefined ? patch.modes : agent.modes,
              initials: name ? initialsFromName(name) : agent.initials,
            }
          : agent,
      ),
    }));
  },

  remove: (agentId) => {
    set((state) => ({
      items: state.items.filter((agent) => agent.id !== agentId),
    }));
  },
}));
