import type { Edge, Node } from 'harnesys';
import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentMemoryConfig,
  CapabilityConfig,
  PortRef,
  ToolOutputSettings,
} from '../../shared/types.ts';

export type AgentGraph = {
  nodes: Record<string, Node>;
  edges: Edge[];
};

export type Agent = {
  id: string;
  workspaceId: string;
  name: string;
  modelId: string | null;
  role: string;
  instructions: string;
  effort: string | null;
  generation: AgentGenerationSettings | null;
  toolOutput: ToolOutputSettings | null;
  compaction: PortRef;
  memory: AgentMemoryConfig;
  /** Empty = all workspace skills (omit allowlist). */
  skills: string[];
  /** Empty = all configured MCP servers (omit allowlist). */
  mcpServers: string[];
  /** Tool name allowlist; empty = all workspace tools. */
  tools: string[];
  graph: AgentGraph;
  budget: AgentBudget | null;
  capabilities: Record<string, CapabilityConfig | null>;
  createdAt: string;
  updatedAt: string;
};

export type AgentInsert = Agent;

export type AgentPatch = {
  name?: string;
  modelId?: string | null;
  role?: string;
  instructions?: string;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  compaction?: PortRef;
  memory?: AgentMemoryConfig | null;
  skills?: string[];
  mcpServers?: string[];
  tools?: string[];
  graph?: AgentGraph;
  budget?: AgentBudget | null;
  capabilities?: Record<string, CapabilityConfig | null>;
  updatedAt?: string;
};

export type AgentRepository = {
  listAll(): Agent[];
  listByWorkspace(workspaceId: string): Agent[];
  findById(id: string): Agent | undefined;
  findByName(workspaceId: string, name: string): Agent | undefined;
  insert(rec: AgentInsert): Agent;
  update(id: string, patch: AgentPatch): Agent;
  delete(id: string): void;
  deleteByWorkspace(workspaceId: string): void;
};
