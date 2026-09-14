import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentMode,
  PackConfig,
  PortRef,
  ToolOutputSettings,
} from '@harnesys/studio-shared';
import {
  ASK_MODE,
  DEFAULT_MODE_ID,
  defaultAgentCompaction,
  modeFromPreset,
} from '@harnesys/studio-shared';
import type { HooksBinding, PermissionMap } from 'harnesys';
import { DEFAULT_REACT_BUDGET } from '../../config/constants.ts';
import type { Agent, AgentGraph, AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { LlmModelRepository } from '../../domain/llm-provider.port.ts';
import type { ModePresetRepository } from '../../domain/mode-preset.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { assertModelEffortSupported } from '../providers/provider.helpers.ts';
import type { GetWorkspaceMcpInput } from '../workspaces/get-workspace-mcp.use-case.ts';
import type { ListWorkspaceSkillsInput } from '../workspaces/list-workspace-skills.use-case.ts';
import {
  ensureAskMode,
  isAgentsPackEnabled,
  validateDefaultModeId,
  validateModeIds,
} from './agent.helpers.ts';
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
  permissions?: PermissionMap | null;
  color?: string | null;
  hooks?: HooksBinding[];
  enabledPlugins?: Record<string, boolean>;
  defaultModeId?: string | null;
  modes?: AgentMode[];
};

export type CreateAgentInput = {
  execute(request: CreateAgentRequest): Promise<Agent>;
};

export type CreateAgentUseCaseDeps = {
  models?: LlmModelRepository;
  modePresets?: ModePresetRepository;
  workspaceCatalog?: {
    listSkills: ListWorkspaceSkillsInput;
    listMcp: GetWorkspaceMcpInput;
  };
  /** Omitted on the catalog-port instance: that port emits desk events itself. */
  deskEvents?: DeskEventsPort;
};

export class CreateAgentUseCase implements CreateAgentInput {
  constructor(
    private readonly agents: AgentRepository,
    private readonly deps: CreateAgentUseCaseDeps = {},
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
      if (this.deps.models) {
        const foundModel = this.deps.models.findById(request.modelId);
        if (!foundModel) {
          throw new NotFoundError('model not found');
        }
      }
      modelId = request.modelId;
    }

    const role = request.role?.trim() || 'Operator';
    const instructions = request.instructions?.trim() || '';
    const effort = request.effort?.trim() || null;
    if (effort !== null && request.modelId && this.deps.models) {
      const effortModel = this.deps.models.findById(request.modelId);
      if (effortModel) {
        assertModelEffortSupported(effortModel, effort);
      }
    }
    const generation = request.generation ?? null;
    const toolOutput = request.toolOutput ?? null;
    const capabilities = request.capabilities ?? {};
    if (parentId !== null && isAgentsPackEnabled(capabilities)) {
      throw new ValidationError('agents pack is forbidden for delegates');
    }
    const permissions = request.permissions ?? null;
    const color = request.color ?? null;
    const compaction =
      request.compaction !== undefined ? request.compaction : defaultAgentCompaction();
    const skills = request.skills ?? [];
    const mcpServers = request.mcpServers ?? [];
    const tools = request.tools ?? [];
    if (skills.length > 0 && this.deps.workspaceCatalog) {
      const listed = await this.deps.workspaceCatalog.listSkills.execute({
        workspaceId: request.workspaceId,
      });
      const known = new Set(listed.skills.map((skill) => skill.name));
      const unknown = skills.filter((skill) => !known.has(skill));
      assertAllKnown(unknown, 'skill');
    }
    if (mcpServers.length > 0 && this.deps.workspaceCatalog) {
      const listed = await this.deps.workspaceCatalog.listMcp.execute({
        workspaceId: request.workspaceId,
      });
      const known = new Set(listed.servers.map((server) => server.serverId));
      const unknown = mcpServers.filter((server) => !known.has(server));
      assertAllKnown(unknown, 'mcp server');
    }
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
      permissions,
      color,
      hooks,
      enabledPlugins,
      defaultModeId,
      modes,
      createdAt: now,
      updatedAt: now,
    });

    this.deps.deskEvents?.emit(request.workspaceId, { type: 'agent', agent: created });

    return await Promise.resolve(created);
  }

  private seedDefaultModes(): AgentMode[] {
    const defaults = (this.deps.modePresets?.list() ?? [])
      .filter((preset) => preset.installedByDefault && preset.id !== DEFAULT_MODE_ID)
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

/** Single unknown → singular message; several → one plural list. */
function assertAllKnown(unknown: string[], noun: string): void {
  if (unknown.length === 0) {
    return;
  }
  const names = unknown.join(', ');
  throw new ValidationError(
    unknown.length === 1 ? `unknown ${noun}: ${names}` : `unknown ${noun}s: ${names}`,
  );
}
