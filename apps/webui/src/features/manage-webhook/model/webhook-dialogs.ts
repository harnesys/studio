import type { Agent } from '@/entities/agent';
import type { Webhook } from '@/entities/webhook';
import { alert, dialog } from '@/shared/services/overlay';
import { WebhookConfigDialog } from '../ui/webhook-config-dialog';
export function openWebhookConfigDialog(agents: Agent[], workspaceId: string, webhook?: Webhook) {
  return dialog.open(WebhookConfigDialog, {
    title: webhook ? `Configure ${webhook.name}` : 'New webhook',
    className: 'sm:max-w-2xl',
    testId: 'webhook-config-dialog',
    data: { agents, workspaceId, webhook: webhook ?? null },
  });
}
export function confirmDeleteWebhook(webhook: Webhook) {
  return alert.confirm({
    title: `Delete ${webhook.name}?`,
    description: 'This webhook will be removed from the workspace.',
    confirmText: 'Delete webhook',
    variant: 'destructive',
    testId: 'delete-webhook-dialog',
  });
}
