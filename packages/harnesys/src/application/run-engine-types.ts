import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { CapabilityRegistration } from '../domain/capability.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { ModelsPort, ProviderConfig } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RunEventStore } from '../ports/run-event-store.ts';
import type { RunLifecycleStore } from '../ports/run-lifecycle-store.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { ToolDefinition } from '../ports/tools.ts';
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
  /** Runtime-wide registrations (RuntimeContext); RunTargetOpts.capabilities wins when set. */
  capabilityRegistrations?: CapabilityRegistration[];
};

export type RunTargetOpts = {
  state: RuntimeState;
  agent: AgentDefinition;
  permissions?: PermissionMap;
  paths?: PathsConfig;
  notes?: LlmNoteProvider[];
  /** Per-run capability registrations; overrides RunEngineDeps.capabilityRegistrations. */
  capabilities?: CapabilityRegistration[];
  /** Per-run registry; overrides RunEngineDeps.toolRegistry when present. */
  toolRegistry?: Map<string, ToolDefinition>;
};

export type RunEngine = {
  /** One segment: the run must be running with our lease (claimer ran claim first). */
  execute(runId: string, opts: RunTargetOpts): Promise<void>;
  /** Interrupts the current segment (AbortController), stops the renew timer. */
  stop(): void;
  /** Alias of stop. */
  close(): void;
};
