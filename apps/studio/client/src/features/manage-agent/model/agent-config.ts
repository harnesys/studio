import type { AgentGraph, PackConfig } from '@harnesys/studio-shared';
import type { HooksBinding } from 'harnesys';
import type { AgentDraft } from '@/entities/agent';

export type AgentCapabilitiesDraft = {
  skills?: string[];
  tools?: string[];
  mcpServers?: string[];
  compaction?: unknown;
  capabilities?: Record<string, PackConfig | null>;
  hooks?: HooksBinding[];
  enabledPlugins?: Record<string, boolean>;
};

export type AgentConfigResult = {
  fields: AgentDraft;
  capabilities: AgentCapabilitiesDraft;
  graph?: AgentGraph;
};
