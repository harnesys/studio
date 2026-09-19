import { type AgentPreset, listAgentPresets } from '../../adapters/agent-presets-fs.adapter.ts';
export type ListAgentPresetsInput = {
  execute(): AgentPreset[];
};
export class ListAgentPresetsUseCase implements ListAgentPresetsInput {
  execute(): AgentPreset[] {
    return listAgentPresets();
  }
}
