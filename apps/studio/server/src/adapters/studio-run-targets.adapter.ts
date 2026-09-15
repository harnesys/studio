import { effectiveMode, normalizeModePackMap, resolveModeId } from '@harnesys/studio-shared';
import type {
  AgentDefinition,
  HookBinding,
  HookEmitCtx,
  PathEntrySpec,
  RunTarget,
  RunTargets,
  RuntimeHandle,
} from 'harnesys';
import { bindMonitorComponents, resolveCapabilitySet } from 'harnesys';
import { effectivePlugins } from '../application/capabilities/effective-plugins.ts';
import { buildCapabilityUniverse, toModeFields } from '../application/capabilities/universe.ts';
import { agentHookBindings, pluginHookBindings } from '../application/plugins/plugin-grant-gate.ts';
import { pluginUserConfig } from '../application/plugins/plugin-user-config.ts';
import { runModeFields } from '../application/threads/thread.helpers.ts';
import { PLUGIN_SESSION_START_HOOK_TIMEOUT_MS } from '../config/constants.ts';
import { logger } from '../config/logger.ts';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { BranchStateSeeder } from '../domain/branch-state-seeder.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';
import type { MonitorJobRegistrar } from '../domain/monitor-jobs.port.ts';
import type { RuntimeStateRepository } from '../domain/runtime-state.port.ts';
import type { ThreadRepository } from '../domain/thread.port.ts';
import type { WorkspaceRepository } from '../domain/workspace.port.ts';
import { runInHostToolScope } from './host-tool-scope.ts';
import type { RunHookBuses } from './run-hook-buses.adapter.ts';
import { permissionMapForRun } from './tool-confirm-policy.ts';
import type {
  LoadedWorkspacePlugin,
  WorkspaceHarnesysRegistry,
} from './workspace-harnesys.registry.ts';

export type StudioRunTargetsDeps = {
  threads: ThreadRepository;
  agents: AgentRepository;
  models: LlmModelRepository;
  providers: LlmProviderRepository;
  workspaces: WorkspaceRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  runtimeStates: RuntimeStateRepository;
  branchSeeder: BranchStateSeeder;
  runHookBuses: RunHookBuses;
  monitorJobs: MonitorJobRegistrar;
};

export class StudioRunTargets implements RunTargets {
  constructor(private readonly deps: StudioRunTargetsDeps) {}

  /**
   * Хук-шина для вне-рановых проходов (ручная компакция): те же грант-фильтрованные
   * биндинги, что собрал бы ран этого треда. `undefined`, если биндингов нет.
   */
  async ensureHooksForThread(threadId: string): Promise<HookEmitCtx | undefined> {
    const thread = this.deps.threads.findById(threadId);
    if (!thread) {
      return undefined;
    }
    const workspace = this.deps.workspaces.findById(thread.workspaceId);
    const agent = workspace
      ? this.deps.workspaceHarnesys.resolveAgentDefinition(thread.agentId)
      : undefined;
    if (!workspace || !agent) {
      return undefined;
    }
    const plugins = effectivePlugins(
      await this.deps.workspaceHarnesys.loadEnabledPlugins(thread.workspaceId),
      agent.enabledPlugins,
    );
    const bindings = composeHookBindings(plugins, agent, workspace.path);
    if (bindings.length === 0) {
      return undefined;
    }
    return this.deps.runHookBuses.ensure({
      threadId,
      workspaceId: thread.workspaceId,
      workspacePath: workspace.path,
      bindings,
      binDirs: collectBinDirs(plugins),
    });
  }

  async resolve(threadId: string): Promise<RunTarget | null> {
    await this.deps.branchSeeder.seedIfNeeded(threadId);
    const thread = this.deps.threads.findById(threadId);
    if (!thread) {
      return null;
    }
    const agentRow = this.deps.agents.findById(thread.agentId);
    if (!agentRow?.modelId) {
      return null;
    }
    const model = this.deps.models.findById(agentRow.modelId);
    if (!model) {
      return null;
    }
    const provider = this.deps.providers.findById(model.providerId);
    if (!provider) {
      return null;
    }
    const workspace = this.deps.workspaces.findById(thread.workspaceId);
    if (!workspace) {
      return null;
    }
    // Chain: thread metadata > agent default > ask; body mode was folded into
    // thread metadata by SendThreadRunUseCase before the run is claimed.
    const runModeId = resolveModeId({
      threadMode: runModeFields(thread).runMode ?? null,
      defaultModeId: agentRow.defaultModeId ?? null,
      modes: agentRow.modes,
    });
    const mode = effectiveMode(agentRow.modes, runModeId);
    let hx: RuntimeHandle;
    try {
      hx = await this.deps.workspaceHarnesys.get(workspace);
    } catch {
      // runtime creation failed (e.g. bad workspace mcp json): target unavailable
      return null;
    }
    // After get(): the registry IR cache is warm, so `pluginName:agentName` ids resolve.
    const agent = this.deps.workspaceHarnesys.resolveAgentDefinition(agentRow.id);
    if (!agent) {
      return null;
    }
    const state = this.deps.runtimeStates.forState(threadId);
    const universe = buildCapabilityUniverse(workspace, {
      hx,
      workspaceHarnesys: this.deps.workspaceHarnesys,
    });
    // Pack `create()` runs here, outside a live run: same host-scope contract as
    // the closed-world materialization. The legacy `tools` allowlist bridge is
    // neutralized on the run path (the DB column is a materialized snapshot, B6;
    // the column itself is removed in T6).
    const capabilitySet = runInHostToolScope(
      { workspaceId: thread.workspaceId, agentId: thread.agentId, threadId },
      () =>
        resolveCapabilitySet(
          { ...agent, tools: undefined },
          {
            ...universe,
            roster: this.deps.workspaceHarnesys.listScopedRoster(agent),
            mode: toModeFields(mode, normalizeModePackMap),
          },
        ),
    );
    if (capabilitySet.fatal.length > 0) {
      logger.warn(
        { scope: 'capabilities' },
        `run target ${threadId}: ${capabilitySet.fatal.join('; ')}`,
      );
      return null;
    }
    const plugins = effectivePlugins(
      await this.deps.workspaceHarnesys.loadEnabledPlugins(thread.workspaceId),
      agent.enabledPlugins,
    );
    const hookBindings = composeHookBindings(plugins, agent, workspace.path);
    const binDirs = collectBinDirs(plugins);
    this.registerMonitorJobs(threadId, plugins);
    // Host-assembled run bus only when hooks exist; otherwise the engine
    // behaves as before (no bus, emitHook no-ops).
    const hooksEmit =
      hookBindings.length > 0
        ? this.deps.runHookBuses.ensure({
            threadId,
            workspaceId: thread.workspaceId,
            workspacePath: workspace.path,
            bindings: hookBindings,
            binDirs,
          })
        : undefined;
    return {
      state,
      agent,
      permissions: permissionMapForRun(agentRow.permissions, mode),
      paths: { allow: [workspace.path], cwd: workspace.path },
      // Single decision: the resolver assembled the run registry once; the
      // engine's `capabilitySet` branch skips `resolveAgentIdentity`/pack create.
      // `toolRegistry` stays on the port until T6 — defs carry the entry's
      // exposure flag (same shape the legacy path produced).
      capabilitySet,
      toolRegistry: new Map(
        [...capabilitySet.registry].map(([name, entry]) => [
          name,
          { ...entry.def, exposure: entry.exposure },
        ]),
      ),
      scope: { workspaceId: thread.workspaceId, agentId: thread.agentId, threadId },
      hooks: hookBindings,
      hooksEmit,
      binDirs,
    };
  }

  private registerMonitorJobs(threadId: string, plugins: LoadedWorkspacePlugin[]): void {
    for (const entry of plugins) {
      const jobs = bindMonitorComponents(entry.ir, {
        pluginRoot: entry.record.path,
        pluginData: entry.record.dataPath,
      });
      if (jobs.length > 0) {
        this.deps.monitorJobs.register({ threadId, jobs, cwd: entry.record.path });
      }
    }
  }
}

/** Plugin bindings (name order, spec §2.4) then agent bindings. */
function composeHookBindings(
  plugins: LoadedWorkspacePlugin[],
  agent: AgentDefinition,
  workspacePath: string,
): HookBinding[] {
  const pluginBindings = plugins
    .toSorted((a, b) => a.record.name.localeCompare(b.record.name))
    .flatMap((entry) =>
      pluginHookBindings(entry.ir, pluginUserConfig(entry.ir, entry.record.options)),
    );
  const bindings = [
    ...pluginBindings,
    ...agentHookBindings(agent.id, agent.hooks ?? [], workspacePath),
  ];
  return bindings.map(lowerSessionStartTimeout);
}

/** Спека §2.4: хост понижает SessionStart до 30s, чтобы старт рана не зависал на 600s. */
function lowerSessionStartTimeout(binding: HookBinding): HookBinding {
  if (binding.event !== 'SessionStart' || binding.handler.type === 'inline') {
    return binding;
  }
  if (binding.handler.timeoutS !== undefined) {
    return binding;
  }
  return {
    ...binding,
    handler: { ...binding.handler, timeoutS: PLUGIN_SESSION_START_HOOK_TIMEOUT_MS / 1000 },
  };
}

/** `bin/` path-entry dirs → RunTarget.binDirs (gated by the derived IR). */
function collectBinDirs(plugins: LoadedWorkspacePlugin[]): string[] {
  const dirs: string[] = [];
  for (const entry of plugins) {
    for (const component of entry.ir.components) {
      if (component.kind === 'path-entry' && component.status === 'native') {
        dirs.push((component.spec as PathEntrySpec).dir);
      }
    }
  }
  return dirs;
}
