import type { AgentGraph } from '@harnesys/studio-shared';
import type { HooksBinding } from 'harnesys';
import type { AgentDraft } from '@/entities/agent';
import type { PackAssignmentMap } from './draft-overrides';
export type AgentCapabilitiesDraft = {
  skills?: string[];
  mcpServers?: string[];
  compaction?: unknown;
  capabilities?: PackAssignmentMap;
  hooks?: HooksBinding[];
  enabledPlugins?: Record<string, boolean>;
};
export type AgentConfigResult = {
  fields: AgentDraft;
  capabilities: AgentCapabilitiesDraft;
  graph?: AgentGraph;
};
