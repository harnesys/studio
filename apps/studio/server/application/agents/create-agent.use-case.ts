import type {
  AgentBudget,
  AgentGenerationSettings,
  PackConfig,
  PortRef,
  ToolOutputSettings,
} from '../../../shared/types.ts';
import { defaultAgentCompaction } from '../../../shared/types.ts';
import type { Agent, AgentGraph, AgentRepository } from '../../domain/agent.port.ts';
import type { LlmModelRepository } from '../../domain/llm-provider.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { assertAgentGraphValid } from './agent-definition-guard.ts';
import { buildReactGraph } from './react-preset.ts';

export type CreateAgentRequest = {
  workspaceId: string;
  name: string;
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
  /** When set, stored as-is; otherwise host builds default ReAct. */
  graph?: AgentGraph;
  budget?: AgentBudget | null;
  capabilities?: Record<string, PackConfig | null>;
};

export type CreateAgentInput = {
  execute(request: CreateAgentRequest): Promise<Agent>;
};

export class CreateAgentUseCase implements CreateAgentInput {
  constructor(
    private readonly agents: AgentRepository,
    private readonly models?: LlmModelRepository,
  ) {}

  async execute(request: CreateAgentRequest): Promise<Agent> {
    const name = request.name?.trim();
    if (!name) {
      throw new ValidationError('agent name is required');
    }

    if (this.agents.findByName(request.workspaceId, name)) {
      throw new ConflictError('agent name taken in workspace');
    }

    let modelId: string | null = null;
    if (request.modelId) {
      if (this.models) {
        const foundModel = this.models.findById(request.modelId);
        if (!foundModel) {
          throw new NotFoundError('model not found');
        }
      }
      modelId = request.modelId;
    }

    const role = request.role?.trim() || 'Operator';
    const instructions = request.instructions?.trim() || '';
    const effort = request.effort?.trim() || null;
    const generation = request.generation ?? null;
    const toolOutput = request.toolOutput ?? null;
    const budget = request.budget ?? null;
    const capabilities = request.capabilities ?? {};
    const compaction =
      request.compaction !== undefined ? request.compaction : defaultAgentCompaction();
    const skills = request.skills ?? [];
    const mcpServers = request.mcpServers ?? [];
    const tools = request.tools ?? [];
    const graph = request.graph !== undefined ? request.graph : buildReactGraph(tools);

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    assertAgentGraphValid({ id, graph, budget });

    const created = this.agents.insert({
      id,
      workspaceId: request.workspaceId,
      name,
      modelId,
      role,
      instructions,
      effort,
      generation,
      toolOutput,
      compaction,
      skills,
      mcpServers,
      tools,
      graph,
      budget,
      capabilities,
      createdAt: now,
      updatedAt: now,
    });

    return await Promise.resolve(created);
  }
}
