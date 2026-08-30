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

export type ToolDefinition = {
  name: string;
  description: string;
  group?: string;
  operations?: string[];
  input: JsonSchema;
  execute(input: unknown, ctx: ToolContext): Promise<unknown> | unknown;
  sideEffect?: SideEffect;
};

export type CustomNodeImpl = {
  execute(ctx: unknown): Promise<unknown> | unknown;
};
