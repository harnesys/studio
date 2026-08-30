import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WebhookPatch, WebhookRepository, WebhookStatus } from '../../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { toWebhookRecord, type WebhookRecord } from './webhook-record.ts';

const WEBHOOK_STATUSES: readonly WebhookStatus[] = ['active', 'paused', 'failed'];

export type UpdateWebhookRequest = {
  workspaceId: string;
  id: string;
  name?: string;
  status?: WebhookStatus;
  targetAgentId?: string;
  detail?: string;
};

export type UpdateWebhookInput = {
  execute(request: UpdateWebhookRequest): Promise<WebhookRecord>;
};

export class UpdateWebhookUseCase implements UpdateWebhookInput {
  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly agents: AgentRepository,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  async execute(request: UpdateWebhookRequest): Promise<WebhookRecord> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const current = this.webhooks.findById(request.id);
    if (!current || current.workspaceId !== request.workspaceId) {
      throw new NotFoundError('webhook not found');
    }

    const patch: WebhookPatch = {};

    if (request.name !== undefined) {
      const name = request.name.trim();
      if (!name) {
        throw new ValidationError('webhook name cannot be empty');
      }
      patch.name = name;
    }

    if (request.status !== undefined) {
      if (!WEBHOOK_STATUSES.includes(request.status)) {
        throw new ValidationError('invalid webhook status');
      }
      patch.status = request.status;
    }

    if (request.targetAgentId !== undefined) {
      const agent = this.agents.findById(request.targetAgentId);
      if (!agent || agent.workspaceId !== request.workspaceId) {
        throw new ValidationError('agent not found');
      }
      patch.targetAgentId = agent.id;
    }

    if (request.detail !== undefined) {
      patch.detail = request.detail.trim();
    }

    return await Promise.resolve(toWebhookRecord(this.webhooks.update(request.id, patch)));
  }
}
