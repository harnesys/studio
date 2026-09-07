import { memoryToolNames } from 'harnesys';
import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentMemoryConfig,
  CapabilityConfig,
  PortRef,
  ToolOutputSettings,
} from '../../../shared/types.ts';
import type { Agent, AgentGraph, AgentPatch, AgentRepository } from '../../domain/agent.port.ts';
import type { LlmModelRepository } from '../../domain/llm-provider.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { requireAgent } from './agent.helpers.ts';
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
  memory?: AgentMemoryConfig | null;
  skills?: string[];
  mcpServers?: string[];
  tools?: string[];
  graph?: AgentGraph;
  budget?: AgentBudget | null;
  capabilities?: Record<string, CapabilityConfig | null>;
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

    if (request.memory !== undefined) {
      patch.memory = request.memory;
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

    if (request.graph !== undefined) {
      patch.graph = request.graph;
    } else if (
      (request.tools !== undefined || request.memory !== undefined) &&
      isStockReactGraph(agent.graph)
    ) {
      const tools = request.tools !== undefined ? request.tools : agent.tools;
      const memory = request.memory !== undefined ? request.memory : agent.memory;
      const graphTools =
        tools.length > 0 ? [...new Set([...tools, ...memoryToolNames(memory)])] : tools;
      patch.graph = buildReactGraph(graphTools);
    }

    assertAgentGraphValid({
      id: agent.id,
      graph: patch.graph ?? agent.graph,
      budget: patch.budget !== undefined ? patch.budget : agent.budget,
    });

    patch.updatedAt = new Date().toISOString();

    return await Promise.resolve(this.agents.update(request.id, patch));
  }
}
