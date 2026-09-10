import { readAgentPreset } from '../../adapters/agent-presets-fs.adapter.ts';
import type { Agent, AgentGraph, AgentRepository } from '../../domain/agent.port.ts';
import { type CreateAgentInput, DEFAULT_REACT_BUDGET } from './create-agent.use-case.ts';
import { uniqueAgentName } from './unique-agent-name.ts';

export type CreateAgentFromPresetRequest = {
  workspaceId: string;
  presetId: string;
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
    const preset = readAgentPreset(request.presetId);
    const name = uniqueAgentName(this.agents, request.workspaceId, preset.name);
    return await this.createAgent.execute({
      workspaceId: request.workspaceId,
      name,
      role: preset.role,
      instructions: preset.instructions,
      tools: preset.tools,
      skills: preset.skills,
      mcpServers: preset.mcpServers,
      budget: preset.budget ?? DEFAULT_REACT_BUDGET,
      capabilities: preset.capabilities,
      ...(preset.graph !== undefined ? { graph: preset.graph as AgentGraph } : {}),
    });
  }
}
