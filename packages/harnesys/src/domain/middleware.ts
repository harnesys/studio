// biome-ignore-all lint/suspicious/noConfusingVoidType: SoT docs/05 uses void in union verbatim
import type { JsonSchema } from './json-schema.ts';

export type GuardDecision =
  | { action: 'allow' }
  | { action: 'deny'; code: string; message?: string }
  | { action: 'ask'; reason: string; resumeSchema: JsonSchema };

export type MiddlewareContext = {
  stage: 'run' | 'node' | 'model' | 'tool';
  agentId: string;
  runId: string;
  nodeId?: string;
  usage: { steps: number; tokens: number; cost?: number };
  state: Readonly<Record<string, unknown>>;
  tool?: { name: string; input: unknown; operations?: string[] };
  model?: { provider: string; model: string };
  node?: { type: string };
  signal?: AbortSignal;
};

export type Middleware = {
  name?: string;
  beforeRun?(ctx: MiddlewareContext): GuardDecision | void | Promise<GuardDecision | void>;
  afterRun?(ctx: MiddlewareContext): void | Promise<void>;
  beforeNode?(ctx: MiddlewareContext): GuardDecision | void | Promise<GuardDecision | void>;
  afterNode?(ctx: MiddlewareContext): void | Promise<void>;
  beforeModel?(ctx: MiddlewareContext): GuardDecision | void | Promise<GuardDecision | void>;
  afterModel?(ctx: MiddlewareContext): void | Promise<void>;
  beforeTool?(ctx: MiddlewareContext): GuardDecision | void | Promise<GuardDecision | void>;
  afterTool?(ctx: MiddlewareContext): void | Promise<void>;
};
