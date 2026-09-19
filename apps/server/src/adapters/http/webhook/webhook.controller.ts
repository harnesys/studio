import type { Hono } from 'hono';
import type { CreateWebhookInput } from '../../../application/webhooks/create-webhook.use-case.ts';
import type { DeleteWebhookInput } from '../../../application/webhooks/delete-webhook.use-case.ts';
import type { FireWebhookInput } from '../../../application/webhooks/fire-webhook.use-case.ts';
import type { ListWebhooksInput } from '../../../application/webhooks/list-webhooks.use-case.ts';
import type { UpdateWebhookInput } from '../../../application/webhooks/update-webhook.use-case.ts';
import { createWebhookBody, fireWebhookBody, updateWebhookBody } from './webhook.body.ts';
export type WebhookControllerDeps = {
  listWebhooks: ListWebhooksInput;
  createWebhook: CreateWebhookInput;
  updateWebhook: UpdateWebhookInput;
  deleteWebhook: DeleteWebhookInput;
  fireWebhook: FireWebhookInput;
};
export class WebhookController {
  constructor(private readonly deps: WebhookControllerDeps) {}
  register(app: Hono): void {
    app.get('/api/workspaces/:id/webhooks', async (c) => {
      const webhooks = await this.deps.listWebhooks.execute({
        workspaceId: c.req.param('id'),
      });
      return c.json(webhooks);
    });
    app.post('/api/workspaces/:id/webhooks', async (c) => {
      const body = createWebhookBody.parse(await c.req.json());
      const created = await this.deps.createWebhook.execute({
        workspaceId: c.req.param('id'),
        name: body.name,
        targetAgentId: body.targetAgentId,
        detail: body.detail,
        threadId: body.threadId,
        status: body.status,
      });
      return c.json(created, 201);
    });
    app.patch('/api/workspaces/:id/webhooks/:webhookId', async (c) => {
      const body = updateWebhookBody.parse(await c.req.json());
      const webhook = await this.deps.updateWebhook.execute({
        workspaceId: c.req.param('id'),
        id: c.req.param('webhookId'),
        name: body.name,
        status: body.status,
        targetAgentId: body.targetAgentId,
        detail: body.detail,
        threadId: body.threadId,
      });
      return c.json(webhook);
    });
    app.delete('/api/workspaces/:id/webhooks/:webhookId', async (c) => {
      await this.deps.deleteWebhook.execute({
        workspaceId: c.req.param('id'),
        id: c.req.param('webhookId'),
      });
      return c.body(null, 204);
    });
    app.post('/api/workspaces/:id/hooks/:webhookId', async (c) => {
      const workspaceId = c.req.param('id');
      const webhookId = c.req.param('webhookId');
      const webhooks = await this.deps.listWebhooks.execute({ workspaceId });
      const webhook = webhooks.find((w) => w.id === webhookId);
      if (!webhook) {
        return c.json({ error: 'webhook not found' }, 404);
      }
      const raw = await c.req.json().catch(() => undefined);
      const body = fireWebhookBody.parse(raw);
      const accepted = await this.deps.fireWebhook.execute({
        webhookId,
        text: body?.text,
      });
      return c.json(accepted ?? { status: 'queued-behind-active-run' }, 202);
    });
  }
}
