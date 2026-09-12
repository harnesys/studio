import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentMode,
  PackConfig,
  PortRef,
  ToolOutputSettings,
} from '@harnesys/studio-shared';
import type { Agent, AgentGraph, AgentPatch, AgentRepository } from '../../domain/agent.port.ts';
import type { LlmModelRepository } from '../../domain/llm-provider.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { requireAgent, validateDefaultModeId, validateModeIds } from './agent.helpers.ts';
import { assertAgentGraphValid } from './agent-definition-guard.ts';
import { isStockReactGraph } from './is-stock-react-graph.ts';
import { buildReactGraph } from './react-preset.ts';

export type UpdateAgentRequest = {
  workspaceId: string;
  id: string;
  name?: string;
  modelId?: string | null;
  role?: string;
  instructions?: string;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  compaction?: PortRef;
  skills?: string[];
  mcpServers?: string[];
  tools?: string[];
  graph?: AgentGraph;
  budget?: AgentBudget | null;
  capabilities?: Record<string, PackConfig | null>;
  defaultModeId?: string | null;
  modes?: AgentMode[];
};

export type UpdateAgentInput = {
  execute(request: UpdateAgentRequest): Promise<Agent>;
};

export class UpdateAgentUseCase implements UpdateAgentInput {
  constructor(
    private readonly agents: AgentRepository,
    private readonly models?: LlmModelRepository,
  ) {}

  async execute(request: UpdateAgentRequest): Promise<Agent> {
    const agent = requireAgent(this.agents, request.workspaceId, request.id);

    const patch: AgentPatch = {};
    if (request.name !== undefined) {
      const name = request.name.trim();
      if (!name) {
        throw new ValidationError('agent name cannot be empty');
      }
      const existing = this.agents.findByName(request.workspaceId, name);
      if (existing && existing.id !== request.id) {
        throw new ConflictError('agent name taken in workspace');
      }
      patch.name = name;
    }

    if (request.modelId !== undefined) {
      if (request.modelId !== null && this.models) {
        const foundModel = this.models.findById(request.modelId);
        if (!foundModel) {
          throw new NotFoundError('model not found');
        }
      }
      patch.modelId = request.modelId;
    }

    if (request.role !== undefined) {
      patch.role = request.role.trim() || 'Operator';
    }

    if (request.instructions !== undefined) {
      patch.instructions = request.instructions.trim();
    }

    if (request.effort !== undefined) {
      patch.effort = request.effort?.trim() || null;
    }

    if (request.generation !== undefined) {
      patch.generation = request.generation;
    }

    if (request.toolOutput !== undefined) {
      patch.toolOutput = request.toolOutput;
    }

    if (request.compaction !== undefined) {
      patch.compaction = request.compaction;
    }

    if (request.skills !== undefined) {
      patch.skills = request.skills;
    }

    if (request.mcpServers !== undefined) {
      patch.mcpServers = request.mcpServers;
    }

    if (request.tools !== undefined) {
      patch.tools = request.tools;
    }

    if (request.budget !== undefined) {
      patch.budget = request.budget;
    }

    if (request.capabilities !== undefined) {
      patch.capabilities = request.capabilities;
    }

    if (request.modes !== undefined) {
      validateModeIds(request.modes);
      // The list is the user's copy: dropping 'ask' here is allowed; only
      // creation seeds it (see create-agent.use-case).
      patch.modes = request.modes;
    }

    if (request.defaultModeId !== undefined) {
      patch.defaultModeId = request.defaultModeId;
      // Validate against the union of stored and incoming modes.
      const allowedModes = [...agent.modes, ...(patch.modes ?? request.modes ?? [])];
      validateDefaultModeId(request.defaultModeId, allowedModes);
    }

    if (request.graph !== undefined) {
      patch.graph = request.graph;
    } else if (request.tools !== undefined && isStockReactGraph(agent.graph)) {
      patch.graph = buildReactGraph(request.tools);
    }

    assertAgentGraphValid({
      id: agent.id,
      graph: patch.graph ?? agent.graph,
      budget: patch.budget !== undefined ? patch.budget : agent.budget,
    });

    patch.updatedAt = new Date().toISOString();

    const previousModelId = agent.modelId;
    const updated = this.agents.update(request.id, patch);

    if (
      request.modelId !== undefined &&
      agent.parentId === null &&
      request.modelId !== previousModelId
    ) {
      const now = patch.updatedAt;
      for (const child of this.agents.listByWorkspace(request.workspaceId)) {
        if (child.parentId !== request.id) {
          continue;
        }
        if (child.modelId !== null && child.modelId !== previousModelId) {
          continue;
        }
        this.agents.update(child.id, { modelId: request.modelId, updatedAt: now });
      }
    }

    return await Promise.resolve(updated);
  }
}
