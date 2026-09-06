import type { CapabilityScope } from '../../domain/capability.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { WebhookPort, WebhookStatus } from '../../ports/webhook.ts';

export type CreateWebhookToolsParams = {
  webhook: WebhookPort;
  resolveScope: () => CapabilityScope;
};

async function runGuard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

type WebhookSetInput = {
  id?: string;
  name?: string;
  detail?: string;
  targetAgentId?: string;
  status?: WebhookStatus;
};

type WebhookDeleteInput = {
  id: string;
};

export function createWebhookTools(deps: CreateWebhookToolsParams): ToolDefinition[] {
  return [
    tool('webhook_list', {
      group: 'webhooks',
      description: 'List inbound webhooks in this workspace.',
      input: { type: 'object' },
      execute: async () =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const rows = await deps.webhook.list(scope);
          return rows.map((row) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            detail: row.detail,
            targetAgentId: row.targetAgentId,
            endpoint: row.endpoint,
            lastFiredAt: row.lastFiredAt,
          }));
        }),
    }),
    tool('webhook_set', {
      group: 'webhooks',
      description:
        'Create a webhook, or update it when id is set. Defaults to this agent as target.',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          detail: { type: 'string' },
          targetAgentId: { type: 'string' },
          status: { type: 'string', enum: ['active', 'paused', 'failed'] },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as WebhookSetInput;
          if (input.id) {
            return await deps.webhook.update(scope, input.id, {
              name: input.name,
              detail: input.detail,
              targetAgentId: input.targetAgentId,
              status: input.status,
            });
          }
          if (!input.name) {
            return { error: 'name is required to create a webhook' };
          }
          return await deps.webhook.create(scope, {
            name: input.name,
            targetAgentId: input.targetAgentId ?? scope.agentId,
            detail: input.detail,
          });
        }),
    }),
    tool('webhook_delete', {
      group: 'webhooks',
      description: 'Delete a webhook by id.',
      input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as WebhookDeleteInput;
          await deps.webhook.remove(scope, input.id);
          return { ok: true, id: input.id };
        }),
    }),
  ];
}
