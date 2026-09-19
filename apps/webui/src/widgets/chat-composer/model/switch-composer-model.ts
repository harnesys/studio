import type { ProviderPublic } from '@harnesys/studio-shared';
import type { Agent } from '@/entities/agent';
import { confirmSwitchModel, updateAgent } from '@/features/manage-agent';
import { ApiError } from '@/shared/api';
import { findModelLabel } from '@/shared/lib/model-label';
import { toast } from '@/shared/ui/toast';
export type SwitchComposerModelOptions = {
  agent: Agent;
  workspaceId: string;
  nextModelId: string;
  hasEvents: boolean;
  providers: ProviderPublic[];
};
export function switchComposerModel(options: SwitchComposerModelOptions): void {
  const { agent, workspaceId, nextModelId, hasEvents, providers } = options;
  if (nextModelId === agent.modelId) {
    return;
  }
  const applySwitch = () => {
    void updateAgent(workspaceId, agent.id, {
      name: agent.name,
      role: agent.role,
      instructions: agent.instructions,
      modelId: nextModelId,
    }).catch((error) => {
      const message = error instanceof ApiError ? error.message : 'Could not switch model';
      toast.add({ title: 'Model', description: message });
    });
  };
  if (!hasEvents) {
    applySwitch();
    return;
  }
  void confirmSwitchModel({
    currentModelName: findModelLabel(agent.modelId, providers),
    nextModelName: findModelLabel(nextModelId, providers),
  }).then((confirmed) => {
    if (confirmed) {
      applySwitch();
    }
  });
}
