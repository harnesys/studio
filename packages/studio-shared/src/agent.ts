import type { Edge, HooksBinding, Node, PackAssignment, PermissionMap } from 'harnesys';
import type { AgentGenerationSettings, PortRef, ToolOutputSettings } from './harnesys-bridge.ts';
import type { AgentMode } from './modes.ts';
export type BudgetPolicy = 'ask' | 'error';
export type AgentBudget = {
  maxSteps?: number;
  maxTokens?: number;
  deadlineMs?: number;
  policy?: BudgetPolicy;
};
export type AgentGraphRankdir = 'TB' | 'LR';
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
export type AgentRecord = {
  id: string;
  name: string;
  workspaceId: string;
  parentId?: string | null;
  modelId?: string | null;
  role: string;
  instructions: string;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  compaction?: PortRef;
  skills?: string[];
  mcpServers?: string[];
  graph?: AgentGraph;
  budget?: AgentBudget | null;
  capabilities?: Record<string, PackAssignment | null>;
  permissions?: PermissionMap | null;
  color?: string | null;
  hooks?: HooksBinding[];
  enabledPlugins?: Record<string, boolean>;
  defaultModeId?: string | null;
  modes?: AgentMode[];
  createdAt: string;
  updatedAt: string;
};
