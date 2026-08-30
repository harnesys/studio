import { type ToolDefinition, tool } from 'harnesys';
import { requireHostToolScope } from '../../adapters/host-tool-scope.ts';
import type { WebhookStatus } from '../../domain/webhook.port.ts';
import type { CreateWebhookInput } from '../webhooks/create-webhook.use-case.ts';
import type { DeleteWebhookInput } from '../webhooks/delete-webhook.use-case.ts';
import type { ListWebhooksInput } from '../webhooks/list-webhooks.use-case.ts';
import type { UpdateWebhookInput } from '../webhooks/update-webhook.use-case.ts';
import { runHostTool } from './run-host-tool.ts';

export type WebhookToolsDeps = {
  listWebhooks: ListWebhooksInput;
  createWebhook: CreateWebhookInput;
  updateWebhook: UpdateWebhookInput;
  deleteWebhook: DeleteWebhookInput;
};

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

export function createWebhookTools(deps: WebhookToolsDeps): ToolDefinition[] {
  return [
    tool('webhook_list', {
      group: 'webhooks',
      description: 'List inbound webhooks in this workspace.',
      input: { type: 'object' },
      execute: async () =>
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const rows = await deps.listWebhooks.execute({ workspaceId: scope.workspaceId });
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
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const input = raw as WebhookSetInput;
          if (input.id) {
            return await deps.updateWebhook.execute({
              workspaceId: scope.workspaceId,
              id: input.id,
              name: input.name,
              detail: input.detail,
              targetAgentId: input.targetAgentId,
              status: input.status,
            });
          }
          if (!input.name) {
            return { error: 'name is required to create a webhook' };
          }
          return await deps.createWebhook.execute({
            workspaceId: scope.workspaceId,
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
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const input = raw as WebhookDeleteInput;
          await deps.deleteWebhook.execute({
            workspaceId: scope.workspaceId,
            id: input.id,
          });
          return { ok: true, id: input.id };
        }),
    }),
  ];
}
