import { memoryToolNames } from 'harnesys';
import type {
  AgentGenerationSettings,
  AgentMemoryConfig,
  PortRef,
  ToolOutputSettings,
} from '../../../shared/types.ts';
import { defaultAgentCompaction, defaultAgentMemory } from '../../../shared/types.ts';
import type { Agent, AgentRepository } from '../../domain/agent.port.ts';
import type { LlmModelRepository } from '../../domain/llm-provider.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
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
  memory?: AgentMemoryConfig | null;
  skills?: string[];
  mcpServers?: string[];
  tools?: string[];
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
    const compaction =
      request.compaction !== undefined ? request.compaction : defaultAgentCompaction();
    const memory = request.memory ?? defaultAgentMemory();
    const skills = request.skills ?? [];
    const mcpServers = request.mcpServers ?? [];
    const tools = request.tools ?? [];
    const graphTools =
      tools.length > 0 ? [...new Set([...tools, ...memoryToolNames(memory)])] : tools;
    const graph = buildReactGraph(graphTools);

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

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
      memory,
      skills,
      mcpServers,
      tools,
      graph,
      budget: null,
      createdAt: now,
      updatedAt: now,
    });

    return await Promise.resolve(created);
  }
}
