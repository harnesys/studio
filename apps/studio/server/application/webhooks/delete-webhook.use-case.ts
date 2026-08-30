import { NotFoundError } from '../../domain/studio.error.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type DeleteWebhookRequest = {
  workspaceId: string;
  id: string;
};

export type DeleteWebhookInput = {
  execute(request: DeleteWebhookRequest): Promise<void>;
};

export class DeleteWebhookUseCase implements DeleteWebhookInput {
  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  async execute(request: DeleteWebhookRequest): Promise<void> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const webhook = this.webhooks.findById(request.id);
    if (!webhook || webhook.workspaceId !== request.workspaceId) {
      throw new NotFoundError('webhook not found');
    }

    this.webhooks.delete(webhook.id);
    await Promise.resolve();
  }
}
