import type { CapabilitySet, CapabilityUniverse } from '../application/capability-set.ts';
import type { HookEmitCtx } from '../application/hooks/emit-hook.ts';
import type { LlmNoteProvider } from '../application/llm-notes.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { HookBinding } from '../domain/hook.ts';

import type { PackRegistration } from '../domain/pack.ts';
import type { PathsConfig } from './paths.ts';
import type { PermissionMap } from './permissions.ts';
import type { RuntimeState } from './runtime-state.ts';
import type { SkillRegistry } from './skills.ts';

export type RunTarget = {
  state: RuntimeState;
  agent: AgentDefinition;
  permissions?: PermissionMap;
  paths?: PathsConfig;
  notes?: LlmNoteProvider[];
  /** Pack registrations for the run; host set wins, otherwise the runtime ctx set. */
  packs?: PackRegistration[];
  /** Pre-resolved capability set; when set the engine skips identity resolution and pack create. */
  capabilitySet?: CapabilitySet;
  /** Host capability universe; carried into the graph so spawn/handoff children resolve their own sets. */
  universe?: CapabilityUniverse;
  /** FS skill registry for the run; falls back to the runtime ctx set. */
  skills?: SkillRegistry;
  /** Per-run hook bindings; merged with the runtime opts set on the run bus. */
  hooks?: HookBinding[];
  /** Host-assembled run bus (E2); wins over deps/opts binding assembly (RunTargetOpts.hooksEmit). */
  hooksEmit?: HookEmitCtx;
  /** Extra PATH entries for hook/tool processes this run (library composes env; D1 consumes). */
  binDirs?: string[];
  /** Opaque host context, meaningless to the library; passed to deps.withScope. */
  scope?: unknown;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: brief specifies interface for RunTargets
export interface RunTargets {
  /** Контекст исполнения резолвится в момент claim, не в момент send. */
  resolve(threadId: string): Promise<RunTarget | null>;
}
