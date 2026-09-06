import type { CapabilityConfig } from '@studio/shared';
import type { AgentDraft } from '@/entities/agent';

export type AgentCapabilitiesDraft = {
  skills?: string[];
  tools?: string[];
  mcpServers?: string[];
  compaction?: unknown;
  memory?: unknown;
  capabilities?: Record<string, CapabilityConfig | null>;
};

export type AgentConfigResult = {
  fields: AgentDraft;
  capabilities: AgentCapabilitiesDraft;
};
