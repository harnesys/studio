import { defineCapability } from '../../domain/pack.ts';
import type { WebhookPort } from '../../ports/webhook.ts';
import { createWebhookTools } from './create-webhook-tools.ts';

export type WebhookCapabilityPorts = { webhook: WebhookPort };

export const webhookCapability = defineCapability<WebhookCapabilityPorts>({
  name: 'webhook',
  version: '1.0.0',
  description: 'Inbound webhooks: webhook_list / webhook_set / webhook_delete',
  requires: ['webhook'],
  tools: (ctx) =>
    createWebhookTools({ webhook: ctx.ports.webhook, resolveScope: ctx.resolveScope }),
  prompt: () => `## Webhooks
- webhook_list / webhook_set / webhook_delete — inbound HTTP that wakes an agent with detail.
- Webhooks deliver their own detail text as the wake message.`,
});
