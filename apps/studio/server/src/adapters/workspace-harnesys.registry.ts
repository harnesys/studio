import type {
  AgentDefinition,
  AgentGenerationSettings,
  AgentModelRef,
  AgentPacks,
  AgentRosterEntry,
  CursorMcpJson,
  ModelsPort,
  PackAssignment,
  PackRegistration,
  PluginIr,
  RunClaimer,
  RunEventFeed,
  RunEventStore,
  RunLifecycleStore,
  RuntimeHandle,
} from 'harnesys';
import {
  askUser,
  buildPluginSkillRegistries,
  composeSkillRegistries,
  createRuntime,
  graphMap,
  type Logger,
  mergePluginMcpFragments,
  normalizePackAssignment,
  wait,
} from 'harnesys';
import { FsSkillRegistry, loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';
import type { PluginInstallRecord, PluginRepository } from '../domain/plugin.port.ts';
import { ValidationError } from '../domain/studio.error.ts';
import type { Workspace } from '../domain/workspace.port.ts';
import { readWorkspaceMcpJson } from './mcp-json.adapter.ts';
import { skillRegistryRoots } from './store/studio-layout.ts';

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
  mcp: CursorMcpJson;
};

export class WorkspaceHarnesysRegistry {
  private readonly cache = new Map<string, Promise<RuntimeHandle>>();

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

  async loadEnabledPlugins(workspaceId: string): Promise<LoadedWorkspacePlugin[]> {
    const repo = this.repos.plugins;
    if (repo === undefined) {
      return [];
    }
    const enabled = repo
      .list()
      .filter((record) => record.enabledWorkspaceIds.includes(workspaceId));
    const loaded: LoadedWorkspacePlugin[] = [];
    for (const record of enabled) {
      try {
        const result = await loadPluginIrFromDirectory({
          root: record.path,
          pluginData: record.dataPath,
        });
        loaded.push({ record, ir: result.ir, mcp: result.mcpFragment });
      } catch {
        // skip failed loads; diagnostics surface via plugin list API
      }
    }
    return loaded;
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
      ...buildPluginSkillRegistries(enabledPlugins.map((entry) => entry.ir)),
    ]);
    const mcp = mergePluginMcpFragments(
      mcpJson,
      enabledPlugins.map((entry) => entry.mcp),
    );
    return createRuntime({
      models: this.models,
      // files/shell/fetch come from the base packs in packRegistrations;
      // ask_user / graph_map / wait have no pack. Per-agent gating in run targets.
      tools: [askUser(), graphMap(), wait()],
      packs: [...this.packRegistrations],
      agents: {
        resolve: (id: string) => this.resolveAgent(id),
        list: () =>
          (this.repos.agents?.listByWorkspace(workspace.id) ?? []).map((a) => ({
            id: a.id,
            name: a.name,
          })),
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
    return (this.repos.agents?.listAll() ?? []).map((a) => ({ id: a.id, name: a.name }));
  }

  private resolveAgent(id: string): AgentDefinition | undefined {
    if (!this.repos.agents) {
      return undefined;
    }
    const agent = this.repos.agents.findById(id);
    if (!agent) {
      return undefined;
    }
    return {
      id: agent.id,
      prompts: { main: { instructions: agent.instructions } },
      model: this.resolveModelRef(agent),
      skills: agent.skills.length ? agent.skills : undefined,
      mcpServers: agent.mcpServers.length ? agent.mcpServers : undefined,
      toolOutput: agent.toolOutput ?? undefined,
      compaction: agent.compaction,
      packs: normalizeAgentPacks(agent.capabilities),
      hooks: agent.hooks.length ? agent.hooks : undefined,
      enabledPlugins: Object.keys(agent.enabledPlugins).length ? agent.enabledPlugins : undefined,
      graph: agent.graph,
      budget: agent.budget ?? undefined,
    };
  }

  private resolveModelRef(agent: {
    modelId: string | null;
    effort: string | null;
    generation: unknown;
  }): AgentModelRef | undefined {
    if (!agent.modelId) {
      return undefined;
    }
    const effort = agent.effort ?? undefined;
    const generation = agent.generation as AgentGenerationSettings | undefined;
    if (this.repos.modelRepo && this.repos.providerRepo) {
      const model = this.repos.modelRepo.findById(agent.modelId);
      if (model) {
        const provider = this.repos.providerRepo.findById(model.providerId);
        if (provider) {
          return {
            provider: provider.name,
            model: model.name,
            effort,
            generation,
          };
        }
      }
      return undefined;
    }
    return {
      provider: '',
      model: '',
      effort,
      generation,
    };
  }
}

/**
 * Stored pack assignments use the `capabilities_json` column. `true`
 * normalizes to `{}`; objects pass through; `false`, `null`, and
 * `undefined` drop the key.
 */
function normalizeAgentPacks(value: Record<string, unknown>): AgentPacks {
  const packs: AgentPacks = {};
  for (const [name, assignment] of Object.entries(value)) {
    if (assignment === undefined || assignment === null || assignment === false) {
      continue;
    }
    packs[name] = normalizePackAssignment(assignment as PackAssignment);
  }
  return packs;
}
