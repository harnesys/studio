import { validateStructural } from '../application/validate.ts';
import type { CapabilityConfig } from './capability.ts';
import { ValidationError } from './errors.ts';
import type { Expr } from './expr.ts';
import type { JsonSchema } from './json-schema.ts';

export type InterruptReason =
  | 'human_review'
  | 'policy'
  | 'uncertain_effect'
  | 'definition_migrated'
  | 'work'
  | 'wait';

export type AgentGenerationSettings = {
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  maxTokens?: number;
};

export type AgentModelRef = {
  provider: string;
  model: string;
  effort?: string;
  generation?: AgentGenerationSettings;
};

export type PortRef = { name: string; version?: string; spec?: Record<string, unknown> } | null;

export type AgentPaths = { allow: string[]; cwd?: string };

export type ToolOutputSettings = {
  maxChars?: number;
  headChars?: number;
  tailChars?: number;
};

export type AgentMemoryConfig = {
  pin?: PortRef;
  semantic?: PortRef;
  episodic?: PortRef;
  knowledge?: PortRef;
  project?: PortRef | { paths: string[] } | null;
};

export type AgentNodes = Record<string, Node>;
export type AgentEdges = Edge[];
export type AgentGraph = { nodes: AgentNodes; edges: AgentEdges };

export type BudgetPolicy = 'ask' | 'error';

export type AgentBudget = {
  maxSteps?: number;
  maxTokens?: number;
  deadlineMs?: number;
  policy?: BudgetPolicy;
};

export type AgentDefinition = {
  id: string;
  version?: string;
  prompts: Record<string, { instructions: string }>;
  model?: AgentModelRef;
  models?: Record<string, AgentModelRef>;
  fallback?: AgentModelRef[];
  skills?: string[];
  tools?: string[];
  mcpServers?: string[];
  toolOutput?: ToolOutputSettings;
  compaction?: PortRef;
  memory?: AgentMemoryConfig;
  paths?: AgentPaths;
  state?: {
    initial: Record<string, Expr | unknown>;
    reducers?: Record<string, 'replace' | 'merge'>;
  };
  graph: AgentGraph;
  budget?: AgentBudget;
  capabilities?: Record<string, CapabilityConfig | null>;
};

export type Edge = { from: string; to: string; when?: Expr };

export type ToolCallFixed = {
  type: 'tool:call';
  name: string;
  args: Record<string, Expr | unknown>;
  calls?: never;
  concurrency?: never;
  approve?: never;
};

export type ToolCallBatch = {
  type: 'tool:call';
  calls: Expr;
  concurrency: Expr | 'parallel' | 'sequential';
  barrier?: { policy: 'all' };
  approve?: {
    tools: string[];
    reason: string;
    resumeSchema: JsonSchema;
  };
  name?: never;
  args?: never;
};

export type Node =
  | { type: 'core:start' }
  | { type: 'core:end'; output?: Expr }
  | {
      type: 'llm:generate';
      model?: string | AgentModelRef;
      prompt: string;
      messages?: Expr;
      tools?: string[];
      output?: JsonSchema;
    }
  | ToolCallFixed
  | ToolCallBatch
  | { type: 'control:assign'; patch: Record<string, Expr | unknown> }
  | {
      type: 'control:spawn';
      calls: Expr;
      concurrency: Expr | 'parallel' | 'sequential';
      barrier?: { policy: 'all' };
    }
  | { type: 'control:goto'; target: Expr }
  | { type: 'control:interrupt'; reason: InterruptReason; resumeSchema: JsonSchema }
  | {
      type: 'control:handoff';
      agentId: string | Expr;
      input: Expr | Record<string, Expr | unknown>;
    }
  | { type: `custom:${string}`; config?: JsonSchema | unknown };

export function defineAgent(def: AgentDefinition): AgentDefinition {
  const diags = validateStructural(def);
  const errors = diags.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
  return JSON.parse(JSON.stringify(def)) as AgentDefinition;
}
