import type { AgentBudget, PackConfig } from '@harnesys/studio-shared';
import type { PermissionMap } from 'harnesys';
import { type AgentPreset, readAgentPreset } from '../../adapters/agent-presets-fs.adapter.ts';
import type { Agent, AgentGraph, AgentRepository } from '../../domain/agent.port.ts';
import type { ValidateAgentConfigInput } from '../capabilities/validate-agent-config.use-case.ts';
import { type CreateAgentInput, DEFAULT_REACT_BUDGET } from './create-agent.use-case.ts';
import { uniqueAgentName } from './unique-agent-name.ts';

/** Preset id → child preset ids seeded as spawn delegates under the new parent. */
const PRESET_DELEGATES: Record<string, readonly string[]> = {
  assistant: ['explorer', 'general'],
  orchestrator: ['explorer', 'general'],
  coder: ['explorer'],
};

export type CreateAgentFromPresetRequest = {
  workspaceId: string;
  presetId: string;
  /** When set, create a single delegate under this top-level agent (no nested seeds). */
  parentId?: string | null;
};

export type CreateAgentFromPresetInput = {
  execute(request: CreateAgentFromPresetRequest): Promise<Agent>;
};

type PresetChildInput = {
  workspaceId: string;
  parentId: string | null;
  name: string;
  role: string;
  instructions: string;
  skills: string[] | undefined;
  mcpServers: string[] | undefined;
  budget: AgentBudget;
  capabilities: Record<string, PackConfig | null>;
  permissions: PermissionMap | undefined;
  modelId: string | null;
  graph: AgentGraph | undefined;
};

export class CreateAgentFromPresetUseCase implements CreateAgentFromPresetInput {
  constructor(
    private readonly agents: AgentRepository,
    private readonly createAgent: CreateAgentInput,
    private readonly validateConfig: ValidateAgentConfigInput,
  ) {}

  async execute(request: CreateAgentFromPresetRequest): Promise<Agent> {
    const parentId = request.parentId ?? null;
    const preset = readAgentPreset(request.presetId);
    const parent = parentId ? this.agents.findById(parentId) : undefined;
    const created = await this.createAgent.execute(
      this.buildInput(request.workspaceId, preset, parent ?? null),
    );

    if (parentId) {
      return created;
    }

    const childPresetIds = PRESET_DELEGATES[request.presetId] ?? [];
    if (childPresetIds.length === 0) {
      return created;
    }
    // All-or-nothing bundle: pre-validate every child against the fresh parent,
    // then create. Modes ride along unvalidated here — `create` seeds
    // installedByDefault modes ⊆ child sources, so the subset verdict cannot
    // change there; the full check still runs inside each `create`.
    // Any failure rolls the whole bundle back; nothing half-created stays.
    const childInputs = childPresetIds.map((childPresetId) =>
      this.buildInput(request.workspaceId, readAgentPreset(childPresetId), created),
    );
    try {
      for (const input of childInputs) {
        await this.validateConfig.execute({
          workspaceId: request.workspaceId,
          parentId: created.id,
          capabilities: input.capabilities,
          skills: input.skills,
          mcpServers: input.mcpServers,
        });
      }
      for (const input of childInputs) {
        await this.createAgent.execute(input);
      }
    } catch (err) {
      for (const child of this.agents.listByWorkspace(request.workspaceId)) {
        if (child.parentId === created.id) {
          this.agents.delete(child.id);
        }
      }
      this.agents.delete(created.id);
      throw err;
    }
    return created;
  }

  private buildInput(
    workspaceId: string,
    preset: AgentPreset,
    parent: Agent | null,
  ): PresetChildInput {
    const parentId = parent?.id ?? null;
    return {
      workspaceId,
      parentId,
      name: uniqueAgentName(this.agents, workspaceId, preset.name),
      role: preset.role,
      instructions: preset.instructions,
      skills: preset.skills,
      mcpServers: preset.mcpServers,
      budget: preset.budget ?? DEFAULT_REACT_BUDGET,
      capabilities: preset.capabilities ?? {},
      permissions: preset.permissions,
      modelId: parent?.modelId ?? null,
      graph: preset.graph as AgentGraph | undefined,
    };
  }
}
