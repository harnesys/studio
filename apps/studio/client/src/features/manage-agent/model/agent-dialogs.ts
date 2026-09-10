import type { Agent } from '@/entities/agent';
import { alert, dialog } from '@/shared/services/overlay';

import { AgentConfigDialog } from '../ui/agent-config-dialog';

export function openAgentConfigDialog(agent: Agent | null, workspaceId: string) {
  return dialog.open(AgentConfigDialog, {
    title: agent ? `Configure ${agent.name}` : 'New agent',
    className: 'flex min-h-0 h-[min(78vh,48rem)] w-full max-w-3xl sm:max-w-3xl overflow-hidden',
    testId: 'agent-config-dialog',
    data: { agent, workspaceId },
  });
}

export function confirmDeleteAgent(agent: Agent) {
  return alert.confirm({
    title: `Delete ${agent.name}?`,
    description:
      'Threads and messages for this agent are deleted from Studio. The workspace folder on disk stays.',
    confirmText: 'Delete agent',
    variant: 'destructive',
    testId: 'delete-agent-dialog',
  });
}

export function confirmSwitchModel(options: { currentModelName?: string; nextModelName?: string }) {
  const { currentModelName, nextModelName } = options;
  const title = nextModelName ? `Switch model to ${nextModelName}?` : 'Change agent model?';
  const description =
    currentModelName && nextModelName
      ? `This thread contains message history with ${currentModelName}. Switching to ${nextModelName} will apply to subsequent messages in this thread.`
      : 'This thread contains message history. Switching the model will apply to subsequent messages in this thread.';

  return alert.confirm({
    title,
    description,
    confirmText: 'Switch model',
    testId: 'switch-model-dialog',
  });
}
