import type {
  CapabilityScope,
  WebhookCreatedRecord,
  WebhookCreateInput,
  WebhookPort,
  WebhookRecord,
  WebhookUpdateInput,
} from 'harnesys';
import type { WebhookRecord as StudioWebhookRecord } from '../../../shared/types.ts';
import type { CreateWebhookInput } from '../../application/webhooks/create-webhook.use-case.ts';
import type { DeleteWebhookInput } from '../../application/webhooks/delete-webhook.use-case.ts';
import type { ListWebhooksInput } from '../../application/webhooks/list-webhooks.use-case.ts';
import type { UpdateWebhookInput } from '../../application/webhooks/update-webhook.use-case.ts';

export type SqliteWebhookPortDeps = {
  listWebhooks: ListWebhooksInput;
  createWebhook: CreateWebhookInput;
  updateWebhook: UpdateWebhookInput;
  deleteWebhook: DeleteWebhookInput;
};

function toWebhookRecord(row: StudioWebhookRecord): WebhookRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    targetAgentId: row.targetAgentId,
    detail: row.detail,
    endpoint: row.endpoint,
    threadId: row.threadId,
    lastFiredAt: row.lastFiredAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteWebhookPort implements WebhookPort {
  constructor(private readonly deps: SqliteWebhookPortDeps) {}

  async list(scope: CapabilityScope): Promise<WebhookRecord[]> {
    const rows = await this.deps.listWebhooks.execute({ workspaceId: scope.workspaceId });
    return rows.map(toWebhookRecord);
  }

  async create(scope: CapabilityScope, input: WebhookCreateInput): Promise<WebhookCreatedRecord> {
    const created = await this.deps.createWebhook.execute({
      workspaceId: scope.workspaceId,
      name: input.name,
      targetAgentId: input.targetAgentId ?? scope.agentId,
      detail: input.detail,
    });
    return {
      webhook: toWebhookRecord(created.webhook),
      thread: created.thread,
    };
  }

  async update(
    scope: CapabilityScope,
    id: string,
    patch: WebhookUpdateInput,
  ): Promise<WebhookRecord> {
    const record = await this.deps.updateWebhook.execute({
      workspaceId: scope.workspaceId,
      id,
      ...patch,
    });
    return toWebhookRecord(record);
  }

  async remove(scope: CapabilityScope, id: string): Promise<void> {
    await this.deps.deleteWebhook.execute({ workspaceId: scope.workspaceId, id });
  }
}
