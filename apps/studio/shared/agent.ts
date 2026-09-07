import type { CapabilityConfig, Edge, Node } from 'harnesys';

import type {
  AgentGenerationSettings,
  AgentMemoryConfig,
  PortRef,
  ToolOutputSettings,
} from './harnesys-bridge.ts';

export type BudgetPolicy = 'ask' | 'error';

export type AgentBudget = {
  maxSteps?: number;
  maxTokens?: number;
  deadlineMs?: number;
  policy?: BudgetPolicy;
};

export type AgentGraphRankdir = 'TB' | 'LR';

export type AgentGraphPosition = { x: number; y: number };

export type AgentGraphLayout = {
  rankdir: AgentGraphRankdir;
  positions: Record<string, AgentGraphPosition>;
};

/** Harnesys `{ nodes, edges }` plus optional Studio canvas layout. */
export type AgentGraph = {
  nodes: Record<string, Node>;
  edges: Edge[];
  layout?: AgentGraphLayout;
};

export type AgentRecord = {
  id: string;
  name: string;
  workspaceId: string;
  modelId?: string | null;
  role: string;
  instructions: string;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  compaction?: PortRef;
  memory?: AgentMemoryConfig | null;
  /** Empty = all workspace skills (omit allowlist). */
  skills?: string[];
  /** Empty = all configured MCP servers (omit allowlist). */
  mcpServers?: string[];
  /** Tool name allowlist; empty = all workspace tools. Memory tools are gated by `memory`. */
  tools?: string[];
  graph?: AgentGraph;
  budget?: AgentBudget | null;
  capabilities?: Record<string, CapabilityConfig | null>;
  createdAt: string;
  updatedAt: string;
};
