import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { HookBinding } from '../domain/hook.ts';
import type { PackRegistration } from '../domain/pack.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { AgentsResolve } from '../ports/create-runtime.ts';
import type { Logger } from '../ports/logger.ts';
import type { ModelsPort, ProviderConfig } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RunEventStore } from '../ports/run-event-store.ts';
import type { RunLifecycleStore } from '../ports/run-lifecycle-store.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { CapabilitySet, CapabilityUniverse } from './capability-set.ts';
import type { HookEmitCtx } from './hooks/emit-hook.ts';
import type { LlmNoteProvider } from './llm-notes.ts';
import type { RunEventFeed } from './run-event-feed.ts';

export type RunEngineDeps = {
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  feed: RunEventFeed;
  instanceId: string;
  leaseTtlMs?: number;
  renewMs?: number;
  /** Process-static graph context (host-owned); per-run context arrives via RunTargetOpts. */
  models: ProviderConfig[] | ModelsPort;
  toolRegistry: Map<string, ToolDefinition>;
  toolMessages: 'barrier' | 'ordered';
  mergeState?: (key: string, a: unknown, b: unknown) => unknown;
  artifacts?: ArtifactStore;
  /** Runtime-wide registrations (RuntimeContext); RunTargetOpts.packs wins when set. */
  packRegistrations?: PackRegistration[];
  /** FS skill registry; RunTargetOpts.skills wins when set. */
  skills?: SkillRegistry;
  agents: AgentsResolve;
  /** Runtime-wide hook bindings; merged with RunTargetOpts.hooks on the per-run bus. */
  hooks?: HookBinding[];
  /** Host diagnostics sink; defaults to the library console logger. */
  logger?: Logger;
};

export type RunTargetOpts = {
  state: RuntimeState;
  agent: AgentDefinition;
  permissions?: PermissionMap;
  paths?: PathsConfig;
  notes?: LlmNoteProvider[];
  /** Per-run pack registrations; overrides RunEngineDeps.packRegistrations. */
  packs?: PackRegistration[];
  /** Pre-resolved capability set (RunTarget.capabilitySet); when set the engine
   *  skips identity resolution and pack create. */
  capabilitySet?: CapabilitySet;
  /** Host capability universe (RunTarget.universe); carried into the graph for spawn/handoff child sets. */
  universe?: CapabilityUniverse;
  /** FS skill registry for the combined load_skill catalog. */
  skills?: SkillRegistry;
  /** Per-run hook bindings (RunTarget.hooks); merged with RunEngineDeps.hooks on the run bus. */
  hooks?: HookBinding[];
  /** Pre-assembled hook emit context (oneshot path); wins over deps/opts binding assembly. */
  hooksEmit?: HookEmitCtx;
  /** Per-run registry; overrides RunEngineDeps.toolRegistry when present. */
  toolRegistry?: Map<string, ToolDefinition>;
  /** Extra PATH dirs for hook/tool processes (RunTarget.binDirs carrier);
   *  the engine composes the run env from it. */
  binDirs?: string[];
};

export type RunEngine = {
  /** One segment: the run must be running with our lease (claimer ran claim first). */
  execute(runId: string, opts: RunTargetOpts): Promise<void>;
  /** Interrupts the current segment (AbortController), stops the renew timer. */
  stop(): void;
  /** Alias of stop. */
  close(): void;
};
