import type { Expr } from './expr.ts';
import type { JsonSchema } from './json-schema.ts';

export type AgentModelRef = {
  provider: string;
  model: string;
  effort?: string;
  generation?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    seed?: number;
    maxTokens?: number;
  };
};

export type AgentDefinition = {
  id: string;
  version?: string;
  prompts: Record<string, { instructions: string }>;
  model?: AgentModelRef;
  models?: Record<string, AgentModelRef>;
  fallback?: AgentModelRef[];
  skills?: string[];
  paths?: { allow: string[]; cwd?: string };
  state?: {
    initial: Record<string, Expr | unknown>;
    reducers?: Record<string, 'replace' | 'merge'>;
  };
  graph: { nodes: Record<string, Node>; edges: Edge[] };
  budget?: {
    maxSteps?: number;
    maxTokens?: number;
    deadlineMs?: number;
  };
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
  | { type: 'control:interrupt'; reason: string; resumeSchema: JsonSchema }
  | {
      type: 'control:handoff';
      agentId: string | Expr;
      input: Expr | Record<string, Expr | unknown>;
    }
  | { type: `custom:${string}`; config?: JsonSchema | unknown };

export function defineAgent(def: AgentDefinition): AgentDefinition {
  return JSON.parse(JSON.stringify(def)) as AgentDefinition;
}
