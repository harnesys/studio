import type { Agent } from '@/entities/agent';
import { alert } from '@/shared/services/overlay';

export { openAgentConfigDialog } from '../ui/agent-config-dialog';
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
