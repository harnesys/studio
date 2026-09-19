import { effectiveMode, MODE_OPS, type ModeOp, resolveModeId } from '@harnesys/studio-shared';
import type {
  AgentDefinition,
  CapabilityUniverse,
  HookBinding,
  HookEmitCtx,
  LlmNoteProvider,
  PathEntrySpec,
  PermissionMap,
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
    const provider = this.deps.providers.findById(thread.workspaceId, model.providerId);
    if (!provider) {
      return null;
    }
    const workspace = this.deps.workspaces.findById(thread.workspaceId);
    if (!workspace) {
      return null;
    }
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
      return null;
    }
    const agent = this.deps.workspaceHarnesys.resolveAgentDefinition(agentRow.id);
    if (!agent) {
      return null;
    }
    const state = this.deps.runtimeStates.forState(threadId);
    const universe = buildCapabilityUniverse(workspace, {
      hx,
      workspaceHarnesys: this.deps.workspaceHarnesys,
    });
    const fullUniverse: CapabilityUniverse = {
      ...universe,
      roster: this.deps.workspaceHarnesys.listScopedRoster(agent),
      mode: toModeFields(mode),
    };
    const capabilitySet = runInHostToolScope(
      { workspaceId: thread.workspaceId, agentId: thread.agentId, threadId },
      () => resolveCapabilitySet(agent, fullUniverse),
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
    const permissions = permissionMapForRun(agentRow.permissions, mode);
    const hooksEmit =
      hookBindings.length > 0
        ? this.deps.runHookBuses.ensure({
            threadId,
            workspaceId: thread.workspaceId,
            workspacePath: workspace.path,
            bindings: hookBindings,
            binDirs,
            permissionMode: runModeId,
          })
        : undefined;
    return {
      state,
      agent,
      permissions,
      notes: [permissionPolicyNote(runModeId, permissions)],
      paths: { allow: [workspace.path], cwd: workspace.path },
      capabilitySet,
      universe: fullUniverse,
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
function permissionPolicyNote(modeId: string, permissions: PermissionMap): LlmNoteProvider {
  return (ctx) => {
    const map = ctx.permissions ?? permissions;
    return [{ tag: 'permissions', text: `mode=${modeId}\n${formatPolicyGates(map)}` }];
  };
}
function formatPolicyGates(permissions: PermissionMap): string {
  const hints: Record<ModeOp, string> = {
    'fs.write': 'write_file, edit_file',
    process: 'shell',
    network: 'fetch, web_search',
    mcp: 'MCP tools',
    agents: 'agents_*',
  };
  return MODE_OPS.map((op) => `${op} (${hints[op]})=${permissions[op] ?? 'ask'}`).join('; ');
}
