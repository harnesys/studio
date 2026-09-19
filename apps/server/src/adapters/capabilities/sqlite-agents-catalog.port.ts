import type {
  AgentCatalogCreated,
  AgentCatalogCreateInput,
  AgentCatalogPatch,
  AgentCatalogSummary,
  AgentDefinition,
  AgentGenerationSettings,
  AgentModelRef,
  AgentsCatalogPort,
  CapabilityScope,
} from 'harnesys';
import type { CreateAgentInput } from '../../application/agents/create-agent.use-case.ts';
import { effectivePluginNames } from '../../application/capabilities/effective-plugins.ts';
import type { PluginAgentCatalog } from '../../application/plugins/plugin-agents.ts';
import type { Agent, AgentPatch, AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import { dbAgentDefinition } from '../workspace-agent-definitions.ts';
export type PluginAgentsRef = {
  current: ((workspaceId: string) => Promise<PluginAgentCatalog>) | null;
};
export type SqliteAgentsCatalogPortDeps = {
  agents: AgentRepository;
  createAgent: CreateAgentInput;
  deskEvents: DeskEventsPort;
  threads?: ThreadRepository;
  models?: LlmModelRepository;
  providers?: LlmProviderRepository;
  pluginAgents?: PluginAgentsRef;
};
export class SqliteAgentsCatalogPort implements AgentsCatalogPort {
  constructor(private readonly deps: SqliteAgentsCatalogPortDeps) {}
  list(
    scope: CapabilityScope,
    filter?: {
      role?: string;
      name?: string;
    },
  ): Promise<AgentCatalogSummary[]> {
    const rows = this.deps.agents.listByWorkspace(scope.workspaceId);
    const base = rows
      .filter((row) => {
        if (row.parentId !== null && row.parentId !== scope.agentId) {
          return false;
        }
        if (filter?.role !== undefined && row.role !== filter.role) {
          return false;
        }
        if (filter?.name !== undefined && row.name !== filter.name) {
          return false;
        }
        return true;
      })
      .map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        instructions: row.instructions,
        parentId: row.parentId,
        ...(row.color !== null ? { color: row.color } : {}),
      }));
    const agentEnabled = this.deps.agents.findById(scope.agentId)?.enabledPlugins;
    return this.pluginAgentsOf(scope.workspaceId).then((pluginAgents) => {
      const summaries = pluginAgents.list();
      const owners = summaries.map((entry) => pluginOwnerOf(entry.id));
      const enabled = effectivePluginNames([...new Set(owners)], agentEnabled);
      return [...base, ...summaries.filter((entry) => enabled.has(pluginOwnerOf(entry.id)))];
    });
  }
  async get(scope: CapabilityScope, id: string): Promise<AgentDefinition | null> {
    const agent = this.deps.agents.findById(id);
    if (agent !== undefined && agent.workspaceId === scope.workspaceId) {
      return toAgentDefinition(agent, this.deps);
    }
    if (!id.includes(':')) {
      return null;
    }
    const owner = pluginOwnerOf(id);
    const agentEnabled = this.deps.agents.findById(scope.agentId)?.enabledPlugins;
    if (!effectivePluginNames([owner], agentEnabled).has(owner)) {
      return null;
    }
    const pluginAgents = await this.pluginAgentsOf(scope.workspaceId);
    return pluginAgents.get(id);
  }
  private pluginAgentsOf(workspaceId: string): Promise<PluginAgentCatalog> {
    const resolve = this.deps.pluginAgents?.current;
    if (resolve === undefined || resolve === null) {
      return Promise.resolve(emptyPluginAgents);
    }
    return resolve(workspaceId).catch(() => emptyPluginAgents);
  }
  async create(
    scope: CapabilityScope,
    input: AgentCatalogCreateInput,
  ): Promise<AgentCatalogCreated> {
    const model = resolveModelFields(input.model, scope.workspaceId, this.deps);
    const created = await this.deps.createAgent.execute({
      workspaceId: scope.workspaceId,
      name: input.name,
      parentId: input.parentId ?? null,
      role: input.role,
      instructions: input.instructions,
      skills: input.skills,
      mcpServers: input.mcpServers,
      budget: input.budget ?? null,
      capabilities: input.packs,
      permissions: input.permissions ?? null,
      graph: input.graph,
      modelId: model?.modelId,
      effort: model?.effort,
      generation: model?.generation,
    });
    this.deps.deskEvents.emit(scope.workspaceId, { type: 'agent', agent: created });
    const def = toAgentDefinition(created, this.deps);
    return {
      id: created.id,
      name: created.name,
      role: created.role,
      instructions: created.instructions,
      parentId: created.parentId,
      packs: Object.keys(def.packs ?? {}).filter((name) => def.packs?.[name]),
      ...(def.model ? { model: `${def.model.provider}/${def.model.model}` } : {}),
      ...(def.budget ? { budget: def.budget } : {}),
      ...(def.permissions ? { permissions: def.permissions } : {}),
    };
  }
  patch(scope: CapabilityScope, id: string, patch: AgentCatalogPatch): Promise<void> {
    const agent = this.deps.agents.findById(id);
    if (!agent || agent.workspaceId !== scope.workspaceId) {
      throw new NotFoundError(`agent "${id}" not found`);
    }
    if (agent.parentId !== scope.agentId) {
      throw new ValidationError('not your delegate');
    }
    const update: AgentPatch = { updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) {
        throw new ValidationError('agent name cannot be empty');
      }
      const existing = this.deps.agents.findByName(scope.workspaceId, name);
      if (existing && existing.id !== id) {
        throw new ConflictError('agent name taken in workspace');
      }
      update.name = name;
    }
    if (patch.role !== undefined) {
      update.role = patch.role.trim() || 'Operator';
    }
    if (patch.instructions !== undefined) {
      update.instructions = patch.instructions.trim();
    }
    if (patch.budget !== undefined) {
      update.budget = patch.budget;
    }
    const updated = this.deps.agents.update(id, update);
    this.deps.deskEvents.emit(scope.workspaceId, { type: 'agent', agent: updated });
    return Promise.resolve();
  }
  remove(
    scope: CapabilityScope,
    id: string,
  ): Promise<
    | {
        ok: true;
      }
    | {
        error: string;
      }
  > {
    const agent = this.deps.agents.findById(id);
    if (!agent || agent.workspaceId !== scope.workspaceId) {
      return Promise.resolve({ error: 'agent not found' });
    }
    if (agent.parentId !== scope.agentId) {
      return Promise.resolve({ error: 'not your delegate' });
    }
    const ownsThreads =
      this.deps.threads
        ?.listByWorkspace(scope.workspaceId)
        .some((thread) => thread.agentId === id || thread.originAgentId === id) ?? false;
    if (ownsThreads) {
      return Promise.resolve({ error: 'agent still owns threads; delete them first' });
    }
    this.deps.agents.delete(id);
    this.deps.deskEvents.emit(scope.workspaceId, { type: 'agent-deleted', id });
    return Promise.resolve({ ok: true });
  }
}
const emptyPluginAgents: PluginAgentCatalog = {
  list: () => [],
  get: () => null,
};
function resolveModelFields(
  model: AgentModelRef | undefined,
  workspaceId: string,
  deps: SqliteAgentsCatalogPortDeps,
): {
  modelId: string;
  effort: string | null;
  generation: AgentGenerationSettings | null;
} | null {
  if (!model) {
    return null;
  }
  const effort = model.effort ?? null;
  const generation = model.generation ?? null;
  if (!deps.providers || !deps.models) {
    throw new ValidationError('model lookup is unavailable');
  }
  const provider = deps.providers.findByName(workspaceId, model.provider);
  if (!provider) {
    throw new NotFoundError(`provider not found: ${model.provider}`);
  }
  const found = deps.models.findByProviderAndName(provider.id, model.model);
  if (!found) {
    throw new NotFoundError(`model not found: ${model.provider}/${model.model}`);
  }
  return { modelId: found.id, effort, generation };
}
function pluginOwnerOf(id: string): string {
  return id.split(':')[0] ?? id;
}
function toAgentDefinition(agent: Agent, deps: SqliteAgentsCatalogPortDeps): AgentDefinition {
  return dbAgentDefinition(agent, { modelRepo: deps.models, providerRepo: deps.providers });
}
