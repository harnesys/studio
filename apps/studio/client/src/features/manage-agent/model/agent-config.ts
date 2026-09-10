import type { AgentGraph, PackConfig } from '@harnesys/studio-shared';
import type { AgentDraft } from '@/entities/agent';

export type AgentCapabilitiesDraft = {
  skills?: string[];
  tools?: string[];
  mcpServers?: string[];
  compaction?: unknown;
  capabilities?: Record<string, PackConfig | null>;
};

export type AgentConfigResult = {
  fields: AgentDraft;
  capabilities: AgentCapabilitiesDraft;
  graph?: AgentGraph;
};
