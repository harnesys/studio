import type {
  AgentCatalogCreateInput,
  AgentCatalogSummary,
  AgentDefinition,
  AgentGenerationSettings,
  AgentModelRef,
  AgentsCatalogPort,
  CapabilityScope,
} from 'harnesys';
import type { CreateAgentInput } from '../../application/agents/create-agent.use-case.ts';
import type { PluginAgentCatalog } from '../../application/plugins/plugin-agents.ts';
import type { Agent, AgentRepository } from '../../domain/agent.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';

/** Late-wired resolver for `plugin:agent` catalog ids (set in create-host). */
export type PluginAgentsRef = {
  current: ((workspaceId: string) => Promise<PluginAgentCatalog>) | null;
};

export type SqliteAgentsCatalogPortDeps = {
  agents: AgentRepository;
  createAgent: CreateAgentInput;
  models?: LlmModelRepository;
  providers?: LlmProviderRepository;
  pluginAgents?: PluginAgentsRef;
};

export class SqliteAgentsCatalogPort implements AgentsCatalogPort {
  constructor(private readonly deps: SqliteAgentsCatalogPortDeps) {}

  list(
    scope: CapabilityScope,
    filter?: { role?: string; name?: string },
  ): Promise<AgentCatalogSummary[]> {
    const rows = this.deps.agents.listByWorkspace(scope.workspaceId);
    const base = rows
      .filter((row) => {
        // Top-level agents plus this run's own delegates (spawn targets).
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
      }));
    return this.pluginAgentsOf(scope.workspaceId).then((pluginAgents) => [
      ...base,
      ...pluginAgents.list(),
    ]);
  }

  async get(scope: CapabilityScope, id: string): Promise<AgentDefinition | null> {
    if (id.startsWith('plugin:')) {
      const pluginAgents = await this.pluginAgentsOf(scope.workspaceId);
      return pluginAgents.get(id);
    }
    const agent = this.deps.agents.findById(id);
    if (!agent || agent.workspaceId !== scope.workspaceId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(toAgentDefinition(agent, this.deps));
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
  ): Promise<{ id: string; name: string }> {
    const model = resolveModelFields(input.model, this.deps);
    const created = await this.deps.createAgent.execute({
      workspaceId: scope.workspaceId,
      name: input.name,
      parentId: input.parentId ?? null,
      role: input.role,
      instructions: input.instructions,
      tools: input.tools,
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
    return { id: created.id, name: created.name };
  }
}

const emptyPluginAgents: PluginAgentCatalog = {
  list: () => [],
  get: () => null,
};

function resolveModelFields(
  model: AgentModelRef | undefined,
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
  const provider = deps.providers.findByName(model.provider);
  if (!provider) {
    throw new NotFoundError(`provider not found: ${model.provider}`);
  }
  const found = deps.models.findByProviderAndName(provider.id, model.model);
  if (!found) {
    throw new NotFoundError(`model not found: ${model.provider}/${model.model}`);
  }
  return { modelId: found.id, effort, generation };
}

function toAgentDefinition(agent: Agent, deps: SqliteAgentsCatalogPortDeps): AgentDefinition {
  return {
    id: agent.id,
    prompts: { main: { instructions: agent.instructions } },
    model: resolveModelRef(agent, deps),
    skills: agent.skills.length ? agent.skills : undefined,
    tools: agent.tools.length ? agent.tools : undefined,
    mcpServers: agent.mcpServers.length ? agent.mcpServers : undefined,
    toolOutput: agent.toolOutput ?? undefined,
    compaction: agent.compaction,
    capabilities: agent.capabilities,
    graph: agent.graph,
    budget: agent.budget ?? undefined,
    ...(agent.permissions ? { permissions: agent.permissions } : {}),
  };
}

function resolveModelRef(
  agent: Agent,
  deps: SqliteAgentsCatalogPortDeps,
): AgentModelRef | undefined {
  if (!agent.modelId) {
    return undefined;
  }
  const effort = agent.effort ?? undefined;
  const generation = agent.generation ?? undefined;
  if (!deps.models || !deps.providers) {
    return undefined;
  }
  const model = deps.models.findById(agent.modelId);
  if (!model) {
    return undefined;
  }
  const provider = deps.providers.findById(model.providerId);
  if (!provider) {
    return undefined;
  }
  return {
    provider: provider.name,
    model: model.name,
    effort,
    generation,
  };
}
