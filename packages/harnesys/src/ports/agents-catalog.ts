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
  parentId?: string;
  permissions?: PermissionMap;
};
export type AgentCatalogPatch = {
  name?: string;
  role?: string;
  instructions?: string;
  budget?: AgentBudget;
};
export type AgentCatalogCreated = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  parentId?: string | null;
  packs: string[];
  model?: string;
  budget?: AgentBudget;
  permissions?: PermissionMap;
};
export type AgentsCatalogPort = {
  list(
    scope: CapabilityScope,
    filter?: {
      role?: string;
      name?: string;
    },
  ): Promise<AgentCatalogSummary[]>;
  get(scope: CapabilityScope, id: string): Promise<AgentDefinition | null>;
  create(scope: CapabilityScope, input: AgentCatalogCreateInput): Promise<AgentCatalogCreated>;
  patch?(scope: CapabilityScope, id: string, patch: AgentCatalogPatch): Promise<void>;
  remove?(
    scope: CapabilityScope,
    id: string,
  ): Promise<
    | {
        ok: true;
      }
    | {
        error: string;
      }
  >;
};
