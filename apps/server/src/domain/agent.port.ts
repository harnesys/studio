import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentMode,
  PortRef,
  ToolOutputSettings,
} from '@harnesys/studio-shared';
import type { Edge, HooksBinding, Node, PackAssignment, PermissionMap } from 'harnesys';
export type AgentGraphRankdir = 'TB' | 'LR';
export type AgentCapabilitiesMap = Record<string, PackAssignment | null>;
export type AgentGraphPosition = {
  x: number;
  y: number;
};
export type AgentGraphLayout = {
  rankdir: AgentGraphRankdir;
  positions: Record<string, AgentGraphPosition>;
};
export type AgentGraph = {
  nodes: Record<string, Node>;
  edges: Edge[];
  layout?: AgentGraphLayout;
  toolPolicy?: 'explicit';
};
export type Agent = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  modelId: string | null;
  role: string;
  instructions: string;
  effort: string | null;
  generation: AgentGenerationSettings | null;
  toolOutput: ToolOutputSettings | null;
  compaction: PortRef;
  skills: string[];
  mcpServers: string[];
  graph: AgentGraph;
  budget: AgentBudget | null;
  capabilities: AgentCapabilitiesMap;
  permissions: PermissionMap | null;
  color: string | null;
  hooks: HooksBinding[];
  enabledPlugins: Record<string, boolean>;
  defaultModeId: string | null;
  modes: AgentMode[];
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
  graph?: AgentGraph;
  budget?: AgentBudget | null;
  capabilities?: AgentCapabilitiesMap;
  permissions?: PermissionMap | null;
  color?: string | null;
  hooks?: HooksBinding[];
  enabledPlugins?: Record<string, boolean>;
  defaultModeId?: string | null;
  modes?: AgentMode[];
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
