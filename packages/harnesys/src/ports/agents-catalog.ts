import type {
  AgentBudget,
  AgentDefinition,
  AgentGraph,
  AgentModelRef,
} from '../domain/agent-definition.ts';
import type { CapabilityConfig, CapabilityScope } from '../domain/capability.ts';

export type AgentCatalogSummary = {
  id: string;
  name: string;
  role: string;
  instructions: string;
};

export type AgentCatalogCreateInput = {
  name: string;
  role: string;
  instructions: string;
  tools?: string[];
  skills?: string[];
  mcpServers?: string[];
  budget?: AgentBudget;
  capabilities?: Record<string, CapabilityConfig | null>;
  graph?: AgentGraph;
  model?: AgentModelRef;
};

export type AgentsCatalogPort = {
  list(
    scope: CapabilityScope,
    filter?: { role?: string; name?: string },
  ): Promise<AgentCatalogSummary[]>;
  get(scope: CapabilityScope, id: string): Promise<AgentDefinition | null>;
  create(
    scope: CapabilityScope,
    input: AgentCatalogCreateInput,
  ): Promise<{ id: string; name: string }>;
};
