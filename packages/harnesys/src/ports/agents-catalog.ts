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
  /** Catalog rows contributed by plugins are spawn-only workers, not team members. */
  plugin?: boolean;
};

export type AgentCatalogCreateInput = {
  name: string;
  role: string;
  instructions: string;
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

export type AgentCatalogPatch = {
  name?: string;
  role?: string;
  instructions?: string;
  budget?: AgentBudget;
};

/** Complete row returned by `create` so the caller can self-verify without a list call. */
export type AgentCatalogCreated = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  parentId?: string | null;
  /** Enabled pack assignment keys (tool sources, not a stored tool-name list). */
  packs: string[];
  /** `provider/model`, when the host could resolve a model for the row. */
  model?: string;
  budget?: AgentBudget;
  permissions?: PermissionMap;
};

export type AgentsCatalogPort = {
  list(
    scope: CapabilityScope,
    filter?: { role?: string; name?: string },
  ): Promise<AgentCatalogSummary[]>;
  get(scope: CapabilityScope, id: string): Promise<AgentDefinition | null>;
  create(scope: CapabilityScope, input: AgentCatalogCreateInput): Promise<AgentCatalogCreated>;
  /** Apply a partial update to an existing agent definition. */
  patch?(scope: CapabilityScope, id: string, patch: AgentCatalogPatch): Promise<void>;
  /** Remove an agent by id. */
  remove?(scope: CapabilityScope, id: string): Promise<{ ok: true } | { error: string }>;
};
