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
import type { Agent, AgentRepository } from '../../domain/agent.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';

export type SqliteAgentsCatalogPortDeps = {
  agents: AgentRepository;
  createAgent: CreateAgentInput;
  models?: LlmModelRepository;
  providers?: LlmProviderRepository;
};

export class SqliteAgentsCatalogPort implements AgentsCatalogPort {
  constructor(private readonly deps: SqliteAgentsCatalogPortDeps) {}

  list(
    scope: CapabilityScope,
    filter?: { role?: string; name?: string },
  ): Promise<AgentCatalogSummary[]> {
    const rows = this.deps.agents.listByWorkspace(scope.workspaceId);
    return Promise.resolve(
      rows
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
        })),
    );
  }

  get(scope: CapabilityScope, id: string): Promise<AgentDefinition | null> {
    const agent = this.deps.agents.findById(id);
    if (!agent || agent.workspaceId !== scope.workspaceId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(toAgentDefinition(agent, this.deps));
  }

  async create(
    scope: CapabilityScope,
    input: AgentCatalogCreateInput,
  ): Promise<{ id: string; name: string }> {
    const model = resolveModelFields(input.model, this.deps);
    const created = await this.deps.createAgent.execute({
      workspaceId: scope.workspaceId,
      name: input.name,
      role: input.role,
      instructions: input.instructions,
      tools: input.tools,
      skills: input.skills,
      mcpServers: input.mcpServers,
      budget: input.budget ?? null,
      capabilities: input.packs,
      graph: input.graph,
      modelId: model?.modelId,
      effort: model?.effort,
      generation: model?.generation,
    });
    return { id: created.id, name: created.name };
  }
}

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
