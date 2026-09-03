import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { PathsConfig } from './paths.ts';
import type { PermissionMap } from './permissions.ts';
import type { RuntimeState } from './runtime-state.ts';

export type RunTarget = {
  state: RuntimeState;
  agent: AgentDefinition;
  permissions?: PermissionMap;
  paths?: PathsConfig;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: brief specifies interface for RunTargets
export interface RunTargets {
  /** Контекст исполнения резолвится в момент claim, не в момент send. */
  resolve(threadId: string): Promise<RunTarget | null>;
}
