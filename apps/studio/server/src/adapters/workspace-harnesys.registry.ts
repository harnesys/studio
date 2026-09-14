import { readFileSync } from 'node:fs';
import type {
  AgentDefinition,
  AgentRosterEntry,
  BindDiagnosticSink,
  CursorMcpJson,
  McpServerSpec,
  ModelsPort,
  PackRegistration,
  PluginComponent,
  PluginIr,
  RunClaimer,
  RunEventFeed,
  RunEventStore,
  RunLifecycleStore,
  RuntimeHandle,
} from 'harnesys';
import {
  askUser,
  bindSkillComponents,
  composeSkillRegistries,
  createRuntime,
  type Logger,
  mapTool,
  mergePluginMcpFragments,
  type PluginMcpBinding,
  wait,
} from 'harnesys';
import { FsSkillRegistry, loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import {
  type PluginAgentCatalog,
  pluginAgentCatalog,
} from '../application/plugins/plugin-agents.ts';
import { applyGrantGating } from '../application/plugins/plugin-grant-gate.ts';
import { pluginUserConfig } from '../application/plugins/plugin-user-config.ts';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';
import type { PluginInstallRecord, PluginRepository } from '../domain/plugin.port.ts';
import { ValidationError } from '../domain/studio.error.ts';
import type { Workspace } from '../domain/workspace.port.ts';
import { readWorkspaceMcpJson } from './mcp-json.adapter.ts';
import { skillRegistryRoots } from './store/studio-layout.ts';
import { dbAgentDefinition } from './workspace-agent-definitions.ts';

export type WorkspaceHarnesysRepos = {
  agents?: AgentRepository;
  modelRepo?: LlmModelRepository;
  providerRepo?: LlmProviderRepository;
  plugins?: PluginRepository;
};

export type WorkspaceRuntimeWiring = {
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  feed: RunEventFeed;
  claimer: RunClaimer;
  instanceId: string;
  logger?: Logger;
};

export type LoadedWorkspacePlugin = {
  record: PluginInstallRecord;
  ir: PluginIr;
};

export class WorkspaceHarnesysRegistry {
  private readonly cache = new Map<string, Promise<RuntimeHandle>>();
  /** Immutable parse-result cache: `${name}@${revision}` → raw IR. Never mutated. */
  private readonly irCache = new Map<string, PluginIr>();

  constructor(
    private readonly models: ModelsPort,
    private readonly repos: WorkspaceHarnesysRepos = {},
    private readonly runtime?: WorkspaceRuntimeWiring,
    private readonly packRegistrations: PackRegistration[] = [],
  ) {}

  get(workspace: Workspace): Promise<RuntimeHandle> {
    const cached = this.cache.get(workspace.id);
    if (cached) {
      return cached;
    }

    const pending = this.create(workspace);
    this.cache.set(workspace.id, pending);
    pending.catch(() => {
      if (this.cache.get(workspace.id) === pending) {
        this.cache.delete(workspace.id);
      }
    });
    return pending;
  }

  invalidate(workspaceId: string): Promise<void> {
    return this.forget(workspaceId);
  }

  async forget(workspaceId: string): Promise<void> {
    const pending = this.cache.get(workspaceId);
    this.cache.delete(workspaceId);
    if (!pending) {
      return;
    }
    try {
      const rt = await pending;
      await rt.close();
    } catch {
      // create failed; nothing to close
    }
  }

  /**
   * Host registrations for this workspace. Pack skills reach `load_skill`
   * through the runtime ctx skills registry, not through a registration,
   * so run targets resolve against this same list.
   */
  effectiveRegistrations(_workspace: Workspace): PackRegistration[] {
    return [...this.packRegistrations];
  }

  /**
   * Workspace-enabled plugins with their grant-gated IR view. The cache keeps
   * parse statuses only; `blocked_by_grant` / `needs_server_approval` are
   * recomputed on every load from `record.grants` + server approvals and are
   * never written back into the cache (spec §4 cache invariant).
   */
  async loadEnabledPlugins(workspaceId: string): Promise<LoadedWorkspacePlugin[]> {
    const repo = this.repos.plugins;
    if (repo === undefined) {
      return [];
    }
    const loaded: LoadedWorkspacePlugin[] = [];
    for (const record of enabledRecords(repo, workspaceId)) {
      const raw = await this.loadIr(record);
      if (raw !== undefined) {
        loaded.push(this.gatedIr(record, raw, workspaceId));
      }
    }
    return loaded;
  }

  /** Plugin agents of this workspace (`pluginName:agentName` catalog ids). */
  async pluginAgents(workspaceId: string): Promise<PluginAgentCatalog> {
    return this.pluginCatalog(await this.loadEnabledPlugins(workspaceId));
  }

  /** Sync catalog from the warm (memoized) IR cache; same contract as resolvePluginAgent. */
  private warmPluginAgents(workspaceId: string): PluginAgentCatalog {
    return this.pluginCatalog(this.cachedLoaded(workspaceId));
  }

  private pluginCatalog(entries: LoadedWorkspacePlugin[]): PluginAgentCatalog {
    return pluginAgentCatalog(
      entries,
      this.repos.modelRepo,
      this.repos.providerRepo,
      this.pluginBindDiagnostic,
      this.packRegistrations,
    );
  }

  /**
   * Диагностики биндинга агентов (`unresolved_model` и frontmatter-предупреждения)
   * идут в runtime-логер, тот же формат, что у load-диагностик плагинов.
   */
  private readonly pluginBindDiagnostic: BindDiagnosticSink = (diagnostic) => {
    this.runtime?.logger?.warn(`[plugins] ${diagnostic.code}: ${diagnostic.message}`);
  };

  private async loadIr(record: PluginInstallRecord): Promise<PluginIr | undefined> {
    const key = irCacheKey(record);
    const cached = this.irCache.get(key);
    if (cached) {
      return cached;
    }
    try {
      const result = await loadPluginIrFromDirectory({
        root: record.path,
        pluginData: record.dataPath,
      });
      this.irCache.set(key, result.ir);
      return result.ir;
    } catch {
      // skip failed loads; diagnostics surface via plugin list API
      return undefined;
    }
  }

  private gatedIr(
    record: PluginInstallRecord,
    raw: PluginIr,
    workspaceId: string,
  ): LoadedWorkspacePlugin {
    const repo = this.repos.plugins;
    const grants = record.grants[workspaceId] ?? {};
    const approved = new Set(repo?.approvals(record.name) ?? []);
    return { record, ir: applyGrantGating(raw, grants, approved) };
  }

  private async create(workspace: Workspace): Promise<RuntimeHandle> {
    let mcpJson: CursorMcpJson;
    try {
      mcpJson = { mcpServers: readWorkspaceMcpJson(workspace.path) };
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : String(err));
    }
    if (this.runtime === undefined) {
      throw new ValidationError(
        'WorkspaceHarnesysRegistry requires runtime wiring (lifecycle+events)',
      );
    }
    const enabledPlugins = await this.loadEnabledPlugins(workspace.id);
    const fsSkills = new FsSkillRegistry({
      roots: skillRegistryRoots(workspace.path),
    });
    const skills = composeSkillRegistries([
      fsSkills,
      ...enabledPlugins.map((entry) =>
        bindSkillComponents(
          entry.ir,
          readPluginSkillFile,
          pluginUserConfig(entry.ir, entry.record.options),
        ),
      ),
    ]);
    // Grant gating and per-server approvals are already applied to the loaded
    // IR views; non-native servers never reach the merge. User-stopped servers
    // stay approved but are excluded here until re-enabled.
    const disabled = new Set(
      (this.repos.plugins?.listDisabledServers(workspace.id) ?? []).map(
        (entry) => `${entry.pluginName}:${entry.serverId}`,
      ),
    );
    const merged = mergePluginMcpFragments(
      mcpJson,
      enabledPlugins.map((entry) => toMcpBinding(entry, disabled)),
    );
    for (const diagnostic of merged.diagnostics) {
      this.runtime?.logger?.warn(`[plugins] ${diagnostic.code}: ${diagnostic.message}`);
    }
    const mcp = merged.mcp;
    return createRuntime({
      models: this.models,
      // files/shell/fetch come from the base packs in packRegistrations;
      // ask_user / map / wait have no pack. Per-agent gating in run targets.
      tools: [askUser(), mapTool(), wait()],
      packs: [...this.packRegistrations],
      agents: {
        resolve: (id: string) => this.resolveAgent(id),
        list: () => [
          ...(this.repos.agents?.listByWorkspace(workspace.id) ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            parentId: a.parentId,
          })),
          ...this.warmPluginAgents(workspace.id)
            .list()
            .map((a) => ({ id: a.id, name: a.name })),
        ],
      },
      mcp,
      paths: { allow: [workspace.path], cwd: workspace.path },
      skills,
      ...this.runtime,
    });
  }

  resolveAgentDefinition(id: string): AgentDefinition | undefined {
    return this.resolveAgent(id);
  }

  listAgentRoster(): AgentRosterEntry[] {
    return (this.repos.agents?.listAll() ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      parentId: a.parentId,
    }));
  }

  private resolveAgent(id: string): AgentDefinition | undefined {
    const agent = this.repos.agents?.findById(id);
    if (agent) {
      return dbAgentDefinition(agent, this.repos);
    }
    return id.includes(':') ? this.resolvePluginAgent(id) : undefined;
  }

  /**
   * `pluginName:agentName` via bindAgentComponents over the cached (warm) IRs.
   * Sync contract of `agents.resolve`: only memoized IRs contribute, so the
   * first resolve must follow `get(workspace)` / `loadEnabledPlugins`.
   */
  private resolvePluginAgent(id: string): AgentDefinition | undefined {
    const plugins = this.repos.plugins;
    if (plugins === undefined) {
      return undefined;
    }
    for (const workspaceId of workspaceIdsWithPlugins(plugins)) {
      const found = this.warmPluginAgents(workspaceId).get(id);
      if (found !== null) {
        return found;
      }
    }
    return undefined;
  }

  private cachedLoaded(workspaceId: string): LoadedWorkspacePlugin[] {
    const repo = this.repos.plugins;
    if (repo === undefined) {
      return [];
    }
    const loaded: LoadedWorkspacePlugin[] = [];
    for (const record of enabledRecords(repo, workspaceId)) {
      const raw = this.irCache.get(irCacheKey(record));
      if (raw !== undefined) {
        loaded.push(this.gatedIr(record, raw, workspaceId));
      }
    }
    return loaded;
  }
}

function irCacheKey(record: PluginInstallRecord): string {
  return `${record.name}@${record.revision}`;
}

function enabledRecords(repo: PluginRepository, workspaceId: string): PluginInstallRecord[] {
  return repo.list().filter((record) => record.enabledWorkspaceIds.includes(workspaceId));
}

function workspaceIdsWithPlugins(repo: PluginRepository): string[] {
  const ids = new Set<string>();
  for (const record of repo.list()) {
    for (const workspaceId of record.enabledWorkspaceIds) {
      ids.add(workspaceId);
    }
  }
  return [...ids];
}

/** Reader for bindSkillComponents: flat command md files live on disk. */
function readPluginSkillFile(file: string): string {
  return readFileSync(file, 'utf8');
}

type McpServerComponent = PluginComponent & { spec: McpServerSpec };

function isMcpServerComponent(component: PluginComponent): component is McpServerComponent {
  return component.kind === 'mcp-server' && component.status === 'native';
}

function toMcpBinding(
  entry: LoadedWorkspacePlugin,
  disabled: ReadonlySet<string>,
): PluginMcpBinding {
  return {
    name: entry.record.name,
    pluginRoot: entry.record.path,
    pluginData: entry.record.dataPath,
    servers: entry.ir.components
      .filter(isMcpServerComponent)
      .map((component) => component.spec)
      .filter((spec) => !disabled.has(`${entry.record.name}:${spec.serverId}`)),
    userConfig: pluginUserConfig(entry.ir, entry.record.options),
  };
}
