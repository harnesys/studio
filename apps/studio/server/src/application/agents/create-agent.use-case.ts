import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentMode,
  PackConfig,
  PortRef,
  ToolOutputSettings,
} from '@harnesys/studio-shared';
import { ASK_MODE, defaultAgentCompaction, modeFromPreset } from '@harnesys/studio-shared';
import type { HooksBinding } from 'harnesys';
import { DEFAULT_REACT_BUDGET } from '../../config/constants.ts';
import type { Agent, AgentGraph, AgentRepository } from '../../domain/agent.port.ts';
import type { LlmModelRepository } from '../../domain/llm-provider.port.ts';
import type { ModePresetRepository } from '../../domain/mode-preset.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { ensureAskMode, validateDefaultModeId, validateModeIds } from './agent.helpers.ts';
import { assertAgentGraphValid } from './agent-definition-guard.ts';
import { isStockReactGraph } from './is-stock-react-graph.ts';
import { buildReactGraph } from './react-preset.ts';

export { DEFAULT_REACT_BUDGET };

export type CreateAgentRequest = {
  workspaceId: string;
  name: string;
  /** When set, creates a spawn delegate under that top-level agent. */
  parentId?: string | null;
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
  hooks?: HooksBinding[];
  enabledPlugins?: Record<string, boolean>;
  defaultModeId?: string | null;
  modes?: AgentMode[];
};

export type CreateAgentInput = {
  execute(request: CreateAgentRequest): Promise<Agent>;
};

export class CreateAgentUseCase implements CreateAgentInput {
  constructor(
    private readonly agents: AgentRepository,
    private readonly models?: LlmModelRepository,
    private readonly modePresets?: ModePresetRepository,
  ) {}

  async execute(request: CreateAgentRequest): Promise<Agent> {
    const name = request.name?.trim();
    if (!name) {
      throw new ValidationError('agent name is required');
    }

    if (this.agents.findByName(request.workspaceId, name)) {
      throw new ConflictError('agent name taken in workspace');
    }

    const parentId = resolveParentId(this.agents, request.workspaceId, request.parentId);

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
    const capabilities = request.capabilities ?? {};
    const compaction =
      request.compaction !== undefined ? request.compaction : defaultAgentCompaction();
    const skills = request.skills ?? [];
    const mcpServers = request.mcpServers ?? [];
    const tools = request.tools ?? [];
    const graph = request.graph !== undefined ? request.graph : buildReactGraph(tools);
    const budget =
      request.budget ??
      (request.graph === undefined || isStockReactGraph(graph) ? DEFAULT_REACT_BUDGET : null);
    const modes = ensureAskMode(request.modes ?? this.seedDefaultModes());
    const defaultModeId = request.defaultModeId ?? null;
    const hooks = request.hooks ?? [];
    const enabledPlugins = request.enabledPlugins ?? {};
    validateModeIds(modes);
    validateDefaultModeId(defaultModeId, modes);

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    assertAgentGraphValid({ id, graph, budget });

    const created = this.agents.insert({
      id,
      workspaceId: request.workspaceId,
      parentId,
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
      hooks,
      enabledPlugins,
      defaultModeId,
      modes,
      createdAt: now,
      updatedAt: now,
    });

    return await Promise.resolve(created);
  }

  private seedDefaultModes(): AgentMode[] {
    const defaults = (this.modePresets?.list() ?? [])
      .filter((preset) => preset.installedByDefault)
      .map(modeFromPreset);
    if (!defaults.some((mode) => mode.id === ASK_MODE.id)) {
      defaults.push({ ...ASK_MODE });
    }
    return defaults;
  }
}

function resolveParentId(
  agents: AgentRepository,
  workspaceId: string,
  parentId: string | null | undefined,
): string | null {
  if (parentId === undefined || parentId === null || parentId === '') {
    return null;
  }
  const parent = agents.findById(parentId);
  if (!parent || parent.workspaceId !== workspaceId) {
    throw new NotFoundError('parent agent not found');
  }
  if (parent.parentId !== null) {
    throw new ValidationError('delegates cannot own delegates');
  }
  return parent.id;
}
