import type {
  AgentBudget,
  AgentGenerationSettings,
  PackConfig,
  PortRef,
  ToolOutputSettings,
} from '@harnesys/studio-shared';
import type { Edge, Node } from 'harnesys';

export type AgentGraphRankdir = 'TB' | 'LR';

export type AgentGraphPosition = { x: number; y: number };

export type AgentGraphLayout = {
  rankdir: AgentGraphRankdir;
  positions: Record<string, AgentGraphPosition>;
};

export type AgentGraph = {
  nodes: Record<string, Node>;
  edges: Edge[];
  layout?: AgentGraphLayout;
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
  /** Empty = all workspace skills (omit allowlist). */
  skills: string[];
  /** Empty = all configured MCP servers (omit allowlist). */
  mcpServers: string[];
  /** Tool name allowlist; empty = all workspace tools. */
  tools: string[];
  graph: AgentGraph;
  budget: AgentBudget | null;
  capabilities: Record<string, PackConfig | null>;
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
  skills?: string[];
  mcpServers?: string[];
  tools?: string[];
  graph?: AgentGraph;
  budget?: AgentBudget | null;
  capabilities?: Record<string, PackConfig | null>;
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
