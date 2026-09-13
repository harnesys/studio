import type {
  AgentBudget,
  AgentDefinition,
  AgentGraph,
  AgentModelRef,
} from '../domain/agent-definition.ts';
import type { CapabilityScope, PackConfig } from '../domain/pack.ts';
import type { PermissionMap } from './permissions.ts';

export type AgentCatalogSummary = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  parentId?: string | null;
  color?: string;
};

export type AgentCatalogCreateInput = {
  name: string;
  role: string;
  instructions: string;
  tools?: string[];
  skills?: string[];
  mcpServers?: string[];
  budget?: AgentBudget;
  packs?: Record<string, PackConfig | null>;
  graph?: AgentGraph;
  model?: AgentModelRef;
  /** When set, creates a delegate under that agent. */
  parentId?: string;
  permissions?: PermissionMap;
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
