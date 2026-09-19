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
  packs?: PackRegistration[];
  capabilitySet?: CapabilitySet;
  universe?: CapabilityUniverse;
  skills?: SkillRegistry;
  hooks?: HookBinding[];
  hooksEmit?: HookEmitCtx;
  binDirs?: string[];
  scope?: unknown;
};
export type RunTargets = {
  resolve(threadId: string): Promise<RunTarget | null>;
};
