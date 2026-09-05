import type { AgentDraft } from '@/entities/agent';

export type AgentCapabilitiesDraft = {
  skills?: string[];
  tools?: string[];
  mcpServers?: string[];
  compaction?: unknown;
  memory?: unknown;
};

export type AgentConfigResult = {
  fields: AgentDraft;
  capabilities: AgentCapabilitiesDraft;
};
