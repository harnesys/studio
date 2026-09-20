import type { NavigateFunction } from 'react-router';
import { useAgentsDisplayStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { studioPath } from '@/shared/config/routes';
import { toast } from '@/shared/ui/toast';
import { openAgentCreatePicker } from '../ui/agent-create-picker-dialog';
import { openAgentConfigDialog } from './agent-dialogs';
import { createAgent } from './create-agent';
import { agentDraftFromPreset } from './create-agent-from-preset';
import { updateAgentCapabilities } from './update-agent';

type AgentCreateFlowOptions = {
  workspaceId: string;
  navigate: NavigateFunction;
  onCreated?: () => void;
};
export async function runAgentCreateFlow({
  workspaceId,
  navigate,
  onCreated,
}: AgentCreateFlowOptions) {
  const choice = await openAgentCreatePicker(workspaceId);
  if (!choice) {
    return;
  }
  const draft = choice.kind === 'preset' ? agentDraftFromPreset(choice.preset) : null;
  const result = await openAgentConfigDialog(draft, workspaceId);
  if (!result) {
    return;
  }
  try {
    const created = await createAgent(workspaceId, result.fields);
    if (!created) {
      return;
    }
    await updateAgentCapabilities(workspaceId, created.agent.id, result.capabilities);
    if (created.thread) {
      useIdeStore.getState().openThread(workspaceId, created.agent.id, created.thread.id);
      useAgentsDisplayStore.getState().expand(created.agent.id);
      await navigate(studioPath.thread(workspaceId, created.thread.id));
    }
    onCreated?.();
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : 'Could not create agent',
    });
  }
}
