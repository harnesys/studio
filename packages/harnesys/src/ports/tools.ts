import type { JsonSchema } from '../domain/json-schema.ts';
import type { ArtifactStore } from './artifacts.ts';

export type SideEffect =
  | 'pure'
  | 'read'
  | 'write'
  | 'destructive'
  | 'financial'
  | 'communication'
  | 'credentialed';

export type ToolContext = {
  cwd: string;
  paths: { allow: string[] };
  signal?: AbortSignal;
  artifacts?: ArtifactStore;
};

export type ToolExecute = (input: unknown, ctx: ToolContext) => Promise<unknown> | unknown;

export type ToolDefinition = {
  name: string;
  description: string;
  group?: string;
  operations?: string[];
  input: JsonSchema;
  execute: ToolExecute;
  sideEffect?: SideEffect;
};

export type CustomNodeImpl = {
  execute(ctx: unknown): Promise<unknown> | unknown;
};

export function tool(
  name: string,
  spec: {
    description: string;
    group?: string;
    operations?: string[];
    input: JsonSchema;
    execute: ToolExecute;
    sideEffect?: SideEffect;
  },
): ToolDefinition {
  if (!name || typeof name !== 'string') {
    throw new Error('tool name required');
  }
  if (!spec.description) {
    throw new Error('tool description required');
  }
  return {
    name,
    description: spec.description,
    group: spec.group,
    operations: spec.operations,
    input: spec.input,
    execute: spec.execute,
    sideEffect: spec.sideEffect,
  };
}
