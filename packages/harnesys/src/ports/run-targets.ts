import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { PathsConfig } from './paths.ts';
import type { PermissionMap } from './permissions.ts';
import type { RuntimeState } from './runtime-state.ts';
import type { ToolDefinition } from './tools.ts';

export type RunTarget = {
  state: RuntimeState;
  agent: AgentDefinition;
  permissions?: PermissionMap;
  paths?: PathsConfig;
  /** Per-run tool registry; overrides the engine default when present. */
  toolRegistry?: Map<string, ToolDefinition>;
  /** Opaque host context, meaningless to the library; passed to deps.withScope. */
  scope?: unknown;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: brief specifies interface for RunTargets
export interface RunTargets {
  /** Контекст исполнения резолвится в момент claim, не в момент send. */
  resolve(threadId: string): Promise<RunTarget | null>;
}
