import type { LlmNoteProvider } from '../application/llm-notes.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { CapabilityRegistration } from '../domain/capability.ts';
import type { PathsConfig } from './paths.ts';
import type { PermissionMap } from './permissions.ts';
import type { RuntimeState } from './runtime-state.ts';
import type { ToolDefinition } from './tools.ts';

export type RunTarget = {
  state: RuntimeState;
  agent: AgentDefinition;
  permissions?: PermissionMap;
  paths?: PathsConfig;
  notes?: LlmNoteProvider[];
  /** Capability registrations for the run; host set wins, otherwise the runtime ctx set. */
  capabilities?: CapabilityRegistration[];
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
