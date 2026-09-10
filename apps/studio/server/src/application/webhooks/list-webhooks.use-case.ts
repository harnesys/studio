import { NotFoundError } from '../../domain/studio.error.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { toWebhookRecord, type WebhookRecord } from './webhook-record.ts';

export type ListWebhooksRequest = {
  workspaceId: string;
};

export type ListWebhooksInput = {
  execute(request: ListWebhooksRequest): Promise<WebhookRecord[]>;
};

export class ListWebhooksUseCase implements ListWebhooksInput {
  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  execute(request: ListWebhooksRequest): Promise<WebhookRecord[]> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return Promise.resolve(this.webhooks.listByWorkspace(request.workspaceId).map(toWebhookRecord));
  }
}
