import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { toWebhookRecord, type WebhookRecord } from './webhook-record.ts';

export type CreateWebhookRequest = {
  workspaceId: string;
  name: string;
  targetAgentId: string;
  detail?: string;
};

export type CreateWebhookInput = {
  execute(request: CreateWebhookRequest): Promise<WebhookRecord>;
};

export class CreateWebhookUseCase implements CreateWebhookInput {
  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly agents: AgentRepository,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  async execute(request: CreateWebhookRequest): Promise<WebhookRecord> {
    const name = request.name?.trim();
    if (!name) {
      throw new ValidationError('webhook name is required');
    }

    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const agent = this.agents.findById(request.targetAgentId);
    if (!agent || agent.workspaceId !== request.workspaceId) {
      throw new ValidationError('agent not found');
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const webhook = this.webhooks.insert({
      id,
      workspaceId: request.workspaceId,
      name,
      status: 'active',
      targetAgentId: agent.id,
      detail: request.detail?.trim() || '',
      endpoint: `/api/workspaces/${request.workspaceId}/hooks/${id}`,
      lastFiredAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return await Promise.resolve(toWebhookRecord(webhook));
  }
}
