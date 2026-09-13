import { readAgentPreset } from '../../adapters/agent-presets-fs.adapter.ts';
import type { Agent, AgentGraph, AgentRepository } from '../../domain/agent.port.ts';
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

export class CreateAgentFromPresetUseCase implements CreateAgentFromPresetInput {
  constructor(
    private readonly agents: AgentRepository,
    private readonly createAgent: CreateAgentInput,
  ) {}

  async execute(request: CreateAgentFromPresetRequest): Promise<Agent> {
    const parentId = request.parentId ?? null;
    const created = await this.createFromPreset(request.workspaceId, request.presetId, parentId);

    if (parentId) {
      return created;
    }

    const childPresetIds = PRESET_DELEGATES[request.presetId] ?? [];
    for (const childPresetId of childPresetIds) {
      await this.createFromPreset(request.workspaceId, childPresetId, created.id);
    }
    return created;
  }

  private async createFromPreset(
    workspaceId: string,
    presetId: string,
    parentId: string | null,
  ): Promise<Agent> {
    const preset = readAgentPreset(presetId);
    const name = uniqueAgentName(this.agents, workspaceId, preset.name);
    const modelId = parentId ? (this.agents.findById(parentId)?.modelId ?? null) : null;
    return await this.createAgent.execute({
      workspaceId,
      parentId,
      name,
      role: preset.role,
      instructions: preset.instructions,
      tools: preset.tools,
      skills: preset.skills,
      mcpServers: preset.mcpServers,
      budget: preset.budget ?? DEFAULT_REACT_BUDGET,
      capabilities: preset.capabilities,
      permissions: preset.permissions,
      modelId,
      ...(preset.graph !== undefined ? { graph: preset.graph as AgentGraph } : {}),
    });
  }
}
