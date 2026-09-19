import type {
  AgentDefinition,
  AgentGenerationSettings,
  AgentModelRef,
  AgentPacks,
  PackAssignment,
} from 'harnesys';
import { normalizePackAssignment } from 'harnesys';
import type { Agent } from '../domain/agent.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';

/** Model lookup repos for resolving an agent's stored model id. */
export type AgentModelRepos = {
  modelRepo?: LlmModelRepository;
  providerRepo?: LlmProviderRepository;
};

/** Stored agent row → engine AgentDefinition (hooks / enabledPlugins included). */
export function dbAgentDefinition(agent: Agent, repos: AgentModelRepos): AgentDefinition {
  return {
    id: agent.id,
    prompts: { main: { instructions: agent.instructions } },
    model: resolveModelRef(agent, repos),
    skills: agent.skills,
    mcpServers: agent.mcpServers,
    toolOutput: agent.toolOutput ?? undefined,
    compaction: agent.compaction,
    packs: normalizeAgentPacks(agent.capabilities),
    hooks: agent.hooks.length ? agent.hooks : undefined,
    enabledPlugins: Object.keys(agent.enabledPlugins).length ? agent.enabledPlugins : undefined,
    graph: agent.graph,
    budget: agent.budget ?? undefined,
    ...(agent.permissions ? { permissions: agent.permissions } : {}),
  };
}

function resolveModelRef(
  agent: {
    workspaceId: string;
    modelId: string | null;
    effort: string | null;
    generation: unknown;
  },
  repos: AgentModelRepos,
): AgentModelRef | undefined {
  if (!agent.modelId) {
    return undefined;
  }
  const effort = agent.effort ?? undefined;
  const generation = agent.generation as AgentGenerationSettings | undefined;
  if (repos.modelRepo && repos.providerRepo) {
    const model = repos.modelRepo.findById(agent.modelId);
    if (model) {
      const provider = repos.providerRepo.findById(agent.workspaceId, model.providerId);
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

/**
 * Stored pack assignments use the `capabilities_json` column. `true`
 * normalizes to `{}`; objects pass through; `false`, `null`, and
 * `undefined` drop the key.
 */
export function normalizeAgentPacks(value: Record<string, unknown>): AgentPacks {
  const packs: AgentPacks = {};
  for (const [name, assignment] of Object.entries(value)) {
    if (assignment === undefined || assignment === null || assignment === false) {
      continue;
    }
    packs[name] = normalizePackAssignment(assignment as PackAssignment);
  }
  return packs;
}
