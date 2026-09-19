import { definePack } from '../../domain/pack.ts';
import type { WebhookPort } from '../../ports/webhook.ts';
import { createWebhookTools } from './create-webhook-tools.ts';
export type WebhookCapabilityPorts = {
  webhook: WebhookPort;
};
export const webhookCapability = definePack<WebhookCapabilityPorts, Record<string, unknown>>({
  name: 'webhook',
  version: '1.0.0',
  description: 'Inbound webhooks: webhook_list / webhook_set / webhook_delete',
  icon: 'webhook',
  meta: {
    tools: [
      { name: 'webhook_list', description: 'List inbound webhooks in this workspace.' },
      {
        name: 'webhook_set',
        description:
          'Create a webhook, or update it when id is set. Defaults to this agent as target.',
      },
      { name: 'webhook_delete', description: 'Delete a webhook by id.' },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: createWebhookTools({ webhook: ctx.ports.webhook, resolveScope: () => ctx.scope }),
  }),
});
