import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentMode,
  PortRef,
  ToolOutputSettings,
} from '@harnesys/studio-shared';
import type { HooksBinding, PermissionMap } from 'harnesys';
import type {
  Agent,
  AgentCapabilitiesMap,
  AgentGraph,
  AgentPatch,
  AgentRepository,
} from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { LlmModelRepository } from '../../domain/llm-provider.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ValidateAgentConfigInput } from '../capabilities/validate-agent-config.use-case.ts';
import { assertModelEffortSupported } from '../providers/provider.helpers.ts';
import {
  isAgentsPackEnabled,
  requireAgent,
  validateDefaultModeId,
  validateModeIds,
} from './agent.helpers.ts';
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
  graph?: AgentGraph;
  budget?: AgentBudget | null;
  capabilities?: AgentCapabilitiesMap;
  permissions?: PermissionMap | null;
  color?: string | null;
  hooks?: HooksBinding[];
  enabledPlugins?: Record<string, boolean>;
  defaultModeId?: string | null;
  modes?: AgentMode[];
};

export type UpdateAgentInput = {
  execute(request: UpdateAgentRequest): Promise<Agent>;
};

export type UpdateAgentUseCaseDeps = {
  models?: LlmModelRepository;
  deskEvents?: DeskEventsPort;
  /** Write-path §7 validation. Required: an omitted gate silently reopens the update bypass. */
  validateConfig: ValidateAgentConfigInput;
};

export class UpdateAgentUseCase implements UpdateAgentInput {
  constructor(
    private readonly agents: AgentRepository,
    private readonly deps: UpdateAgentUseCaseDeps,
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
      if (request.modelId !== null && this.deps.models) {
        const foundModel = this.deps.models.findById(request.modelId);
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
      if (patch.effort !== null && this.deps.models) {
        const modelId = patch.modelId ?? agent.modelId;
        if (modelId !== null) {
          const effortModel = this.deps.models.findById(modelId);
          if (effortModel) {
            assertModelEffortSupported(effortModel, patch.effort);
          }
        }
      }
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

    if (request.budget !== undefined) {
      patch.budget = request.budget;
    }

    if (request.capabilities !== undefined) {
      patch.capabilities = request.capabilities;
    }
    // Stored record was read before the patch: a delegate may never carry the agents pack.
    if (agent.parentId !== null && isAgentsPackEnabled(patch.capabilities ?? agent.capabilities)) {
      throw new ValidationError('agents pack is forbidden for delegates');
    }

    if (request.permissions !== undefined) {
      patch.permissions = request.permissions;
    }

    if (request.color !== undefined) {
      patch.color = request.color;
    }

    if (request.hooks !== undefined) {
      patch.hooks = request.hooks;
    }

    if (request.enabledPlugins !== undefined) {
      patch.enabledPlugins = request.enabledPlugins;
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
    } else if (request.capabilities !== undefined && isStockReactGraph(agent.graph)) {
      // Смена источников на сток-графе: пересборка шаблона без снапшота
      // `think.tools` — набор резолвится на каждый ран, нода видит весь.
      patch.graph = buildReactGraph();
    }

    assertAgentGraphValid({
      id: agent.id,
      graph: patch.graph ?? agent.graph,
      budget: patch.budget !== undefined ? patch.budget : agent.budget,
    });

    // §7 write-path (тот же gate, что create): источники/overrides/режимы и
    // child⊆creator закрывают update-обход; `core` provisioned в патч при записи.
    if (
      request.capabilities !== undefined ||
      request.enabledPlugins !== undefined ||
      request.skills !== undefined ||
      request.mcpServers !== undefined ||
      request.modes !== undefined
    ) {
      const checked = await this.deps.validateConfig.execute({
        workspaceId: request.workspaceId,
        agentId: agent.id,
        parentId: agent.parentId,
        capabilities: request.capabilities ?? agent.capabilities,
        enabledPlugins: request.enabledPlugins ?? agent.enabledPlugins,
        skills: request.skills ?? agent.skills,
        mcpServers: request.mcpServers ?? agent.mcpServers,
        modes: request.modes ?? agent.modes,
      });
      if (request.capabilities !== undefined) {
        patch.capabilities = checked.capabilities;
      } else if (checked.capabilities !== agent.capabilities) {
        // Heal без запроса: валидация provisioned `core`, строка его не имела.
        patch.capabilities = checked.capabilities;
      }
      if (request.modes !== undefined) {
        patch.modes = checked.modes ?? request.modes;
      }
    }

    patch.updatedAt = new Date().toISOString();

    const previousModelId = agent.modelId;
    const updated = this.agents.update(request.id, patch);
    this.deps.deskEvents?.emit(request.workspaceId, { type: 'agent', agent: updated });

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
        const updatedChild = this.agents.update(child.id, {
          modelId: request.modelId,
          updatedAt: now,
        });
        this.deps.deskEvents?.emit(request.workspaceId, { type: 'agent', agent: updatedChild });
      }
    }

    return await Promise.resolve(updated);
  }
}
