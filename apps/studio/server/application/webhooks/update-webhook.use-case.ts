import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WebhookPatch, WebhookRepository, WebhookStatus } from '../../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { requireBindableWebhookThread } from './bind-webhook-thread.ts';
import { toWebhookRecord, type WebhookRecord } from './webhook-record.ts';

const WEBHOOK_STATUSES: readonly WebhookStatus[] = ['active', 'paused', 'failed'];

export type UpdateWebhookRequest = {
  workspaceId: string;
  id: string;
  name?: string;
  status?: WebhookStatus;
  targetAgentId?: string;
  detail?: string;
  threadId?: string;
};

export type UpdateWebhookInput = {
  execute(request: UpdateWebhookRequest): Promise<WebhookRecord>;
};

export type UpdateWebhookDeps = {
  webhooks: WebhookRepository;
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  threads: ThreadRepository;
  deskEvents: DeskEventsPort;
};

export class UpdateWebhookUseCase implements UpdateWebhookInput {
  private readonly webhooks: WebhookRepository;
  private readonly agents: AgentRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly threads: ThreadRepository;
  private readonly deskEvents: DeskEventsPort;

  constructor(deps: UpdateWebhookDeps) {
    this.webhooks = deps.webhooks;
    this.agents = deps.agents;
    this.workspaces = deps.workspaces;
    this.threads = deps.threads;
    this.deskEvents = deps.deskEvents;
  }

  async execute(request: UpdateWebhookRequest): Promise<WebhookRecord> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const current = this.webhooks.findById(request.id);
    if (!current || current.workspaceId !== request.workspaceId) {
      throw new NotFoundError('webhook not found');
    }

    const patch: WebhookPatch = {
      updatedAt: new Date().toISOString(),
    };

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

    if (request.threadId !== undefined && request.threadId !== current.threadId) {
      requireBindableWebhookThread({
        threads: this.threads,
        webhooks: this.webhooks,
        workspaceId: request.workspaceId,
        agentId: request.targetAgentId ?? current.targetAgentId,
        threadId: request.threadId,
        exceptWebhookId: current.id,
      });
      patch.threadId = request.threadId;
    }

    if (request.detail !== undefined) {
      patch.detail = request.detail.trim();
    }

    const updated = this.webhooks.update(request.id, patch);
    this.deskEvents.emit(request.workspaceId, {
      type: 'webhook',
      webhook: toWebhookRecord(updated),
    });
    return await Promise.resolve(toWebhookRecord(updated));
  }
}
