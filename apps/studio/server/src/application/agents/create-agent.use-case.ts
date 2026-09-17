import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentMode,
  PortRef,
  ToolOutputSettings,
} from '@harnesys/studio-shared';
import { DEFAULT_MODE_ID, defaultAgentCompaction, modeFromPreset } from '@harnesys/studio-shared';
import type { HooksBinding, PermissionMap } from 'harnesys';
import { DEFAULT_REACT_BUDGET } from '../../config/constants.ts';
import type {
  Agent,
  AgentCapabilitiesMap,
  AgentGraph,
  AgentRepository,
} from '../../domain/agent.port.ts';

import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { LlmModelRepository } from '../../domain/llm-provider.port.ts';
import type { ModePresetRepository } from '../../domain/mode-preset.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ValidateAgentConfigInput } from '../capabilities/validate-agent-config.use-case.ts';
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
  /** When set, stored as-is; otherwise host builds default ReAct. */
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
  /** Write-path §7 validation (ruling T7: provision core, strict остальное). */
  validateConfig: ValidateAgentConfigInput;
};

export class CreateAgentUseCase implements CreateAgentInput {
  constructor(
    private readonly agents: AgentRepository,
    private readonly deps: CreateAgentUseCaseDeps,
  ) {}

  async execute(request: CreateAgentRequest): Promise<Agent> {
    const name = request.name?.trim();
    if (!name) {
      throw new ValidationError('agent name is required');
    }

    if (this.agents.findByName(request.workspaceId, name)) {
      throw new ConflictError('agent name taken in workspace');
    }

    const parent = resolveParent(this.agents, request.workspaceId, request.parentId);
    const parentId = parent?.id ?? null;

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
    const graph = request.graph !== undefined ? request.graph : buildReactGraph();
    let defaultBudget: AgentBudget | null;
    if (parentId !== null) {
      defaultBudget = { maxSteps: 25, policy: 'error' };
    } else if (request.graph === undefined || isStockReactGraph(graph)) {
      defaultBudget = DEFAULT_REACT_BUDGET;
    } else {
      defaultBudget = null;
    }
    const budget = request.budget ?? defaultBudget;
    const modes = ensureAskMode(
      request.modes ?? this.seedDefaultModes(request.workspaceId, capabilities),
    );
    const defaultModeId = request.defaultModeId ?? null;
    const hooks = request.hooks ?? [];
    const enabledPlugins = request.enabledPlugins ?? {};
    validateModeIds(modes);
    validateDefaultModeId(defaultModeId, modes);
    // §7 write-path: источники/overrides/режимы/child⊆creator; `core` provisioned,
    // остальное — строгий отказ (HTTP 400, tool-path `{error}` через runGuard).
    const checked = await this.deps.validateConfig.execute({
      workspaceId: request.workspaceId,
      parentId,
      capabilities,
      enabledPlugins,
      skills,
      mcpServers,
      modes,
    });

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
      graph,
      budget,
      capabilities: checked.capabilities,
      permissions,
      color,
      hooks,
      enabledPlugins,
      defaultModeId,
      modes: checked.modes ?? modes,
      createdAt: now,
      updatedAt: now,
    });

    this.deps.deskEvents?.emit(request.workspaceId, { type: 'agent', agent: created });

    return await Promise.resolve(created);
  }

  private seedDefaultModes(workspaceId: string, capabilities: AgentCapabilitiesMap): AgentMode[] {
    const granted = new Set(
      Object.entries(capabilities)
        .filter(([, value]) => {
          const raw: unknown = value;
          return raw !== undefined && raw !== null && raw !== false;
        })
        .map(([name]) => name),
    );
    // Сиды совместимые: strict-режим (`mode ⊆ agent`) требует, чтобы seeded-план
    // не ломал создание агентов без plan-пака; ask/auto без packs проходят всегда.
    // `core` provisioned валидацией позже и на фильтр не влияет.
    return (this.deps.modePresets?.list(workspaceId) ?? [])
      .filter((preset) => preset.installedByDefault && preset.id !== DEFAULT_MODE_ID)
      .map(modeFromPreset)
      .filter((mode) => {
        const packMap = mode.packs;
        if (packMap === undefined) {
          return true;
        }
        return Object.entries(packMap).every(([name, assignment]) => {
          const raw: unknown = assignment;
          return raw === undefined || raw === null || raw === false || granted.has(name);
        });
      });
  }
}

/** Родительская строка делегата (валидация та же, что раньше); null — top-level. */
function resolveParent(
  agents: AgentRepository,
  workspaceId: string,
  parentId: string | null | undefined,
): Agent | null {
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
  return parent;
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
