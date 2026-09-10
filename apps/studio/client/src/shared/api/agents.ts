import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentGraph,
  AgentRecord,
  PackConfig,
  PortRef,
  ToolOutputSettings,
} from '@harnesys/studio-shared';

import { apiJson } from './client';

export type CreateAgentInput = {
  name: string;
  modelId?: string | null;
  role?: string;
  instructions?: string;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  budget?: AgentBudget | null;
  compaction?: PortRef;
  skills?: string[];
  mcpServers?: string[];
  tools?: string[];
  graph?: AgentGraph;
  capabilities?: Record<string, PackConfig | null>;
};

export type UpdateAgentInput = {
  name?: string;
  modelId?: string | null;
  role?: string;
  instructions?: string;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  budget?: AgentBudget | null;
  compaction?: PortRef;
  skills?: string[];
  mcpServers?: string[];
  tools?: string[];
  graph?: AgentGraph;
  capabilities?: Record<string, PackConfig | null>;
};

export type AgentPresetRecord = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  tools?: string[];
  skills?: string[];
  mcpServers?: string[];
  budget?: AgentBudget | null;
  capabilities?: Record<string, PackConfig | null>;
};

export function listAgents() {
  return apiJson<AgentRecord[]>('/api/agents');
}

export function listAgentPresets() {
  return apiJson<AgentPresetRecord[]>('/api/agent-presets');
}

export function createAgentRecord(workspaceId: string, body: CreateAgentInput) {
  return apiJson<AgentRecord>(`/api/workspaces/${workspaceId}/agents`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function createAgentFromPresetRecord(workspaceId: string, presetId: string) {
  return apiJson<AgentRecord>(`/api/workspaces/${workspaceId}/agents/from-preset`, {
    method: 'POST',
    body: JSON.stringify({ presetId }),
  });
}

export function updateAgentRecord(workspaceId: string, agentId: string, body: UpdateAgentInput) {
  return apiJson<AgentRecord>(`/api/workspaces/${workspaceId}/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteAgentRecord(workspaceId: string, agentId: string) {
  return apiJson<void>(`/api/workspaces/${workspaceId}/agents/${agentId}`, {
    method: 'DELETE',
  });
}
