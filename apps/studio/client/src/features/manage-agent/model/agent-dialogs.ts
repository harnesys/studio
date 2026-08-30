import type { Agent } from '@/entities/agent';
import { alert, dialog } from '@/shared/services/overlay';

import { CreateAgentDialog, EditAgentDialog } from '../ui/agent-dialogs';

export function openCreateAgentDialog() {
  return dialog.open(CreateAgentDialog, {
    title: 'New agent',
    description:
      'Give the agent a name, role, and instructions. You can change the rest in the inspector.',
    className: 'sm:max-w-lg',
    testId: 'create-agent-dialog',
  });
}

export function openEditAgentDialog(agent: Agent) {
  return dialog.open(EditAgentDialog, {
    title: 'Edit agent',
    description: 'Name, role, instructions, model, and generation settings for this agent.',
    className: 'sm:max-w-lg',
    testId: 'edit-agent-dialog',
    data: { agent },
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
