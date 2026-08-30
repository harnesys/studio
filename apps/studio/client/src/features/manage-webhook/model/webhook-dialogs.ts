import type { Webhook } from '@/entities/webhook';
import { alert } from '@/shared/services/overlay';

export function confirmDeleteWebhook(webhook: Webhook) {
  return alert.confirm({
    title: `Delete ${webhook.name}?`,
    description: 'This webhook will be removed from the workspace.',
    confirmText: 'Delete webhook',
    variant: 'destructive',
    testId: 'delete-webhook-dialog',
  });
}
