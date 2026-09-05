import type { CreateWebhookResponse } from '../../../shared/types.ts';
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { GetThreadInput } from '../threads/get-thread.use-case.ts';
import { requireBindableWebhookThread } from './bind-webhook-thread.ts';
import { toWebhookRecord, type WebhookRecord } from './webhook-record.ts';

export type CreateWebhookRequest = {
  workspaceId: string;
  name: string;
  targetAgentId: string;
  detail?: string;
  threadId?: string;
};

export type CreateWebhookInput = {
  execute(request: CreateWebhookRequest): Promise<CreateWebhookResponse>;
};

export type CreateWebhookDeps = {
  webhooks: WebhookRepository;
  threads: ThreadRepository;
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
  db?: StudioDb;
};

export class CreateWebhookUseCase implements CreateWebhookInput {
  private readonly webhooks: WebhookRepository;
  private readonly threads: ThreadRepository;
  private readonly agents: AgentRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly deskEvents: DeskEventsPort;
  private readonly getThread: GetThreadInput;
  private readonly db?: StudioDb;

  constructor(deps: CreateWebhookDeps) {
    this.webhooks = deps.webhooks;
    this.threads = deps.threads;
    this.agents = deps.agents;
    this.workspaces = deps.workspaces;
    this.deskEvents = deps.deskEvents;
    this.getThread = deps.getThread;
    this.db = deps.db;
  }

  async execute(request: CreateWebhookRequest): Promise<CreateWebhookResponse> {
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
    const boundThread = request.threadId
      ? requireBindableWebhookThread({
          threads: this.threads,
          webhooks: this.webhooks,
          workspaceId: request.workspaceId,
          agentId: agent.id,
          threadId: request.threadId,
        })
      : null;
    const threadId = boundThread?.id ?? crypto.randomUUID();
    const dedicated = boundThread === null;

    const perform = (): WebhookRecord => {
      if (dedicated) {
        this.threads.insert({
          id: threadId,
          workspaceId: request.workspaceId,
          agentId: agent.id,
          title: name,
          kind: 'webhook',
          metadata: {},
          createdAt: now,
          updatedAt: now,
          lastReadAt: now,
        });
      }
      const webhook = this.webhooks.insert({
        id,
        workspaceId: request.workspaceId,
        name,
        status: 'active',
        targetAgentId: agent.id,
        detail: request.detail?.trim() || '',
        endpoint: `/api/workspaces/${request.workspaceId}/hooks/${id}`,
        threadId,
        lastFiredAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return toWebhookRecord(webhook);
    };

    const record = this.db ? this.db.transaction(perform) : perform();

    this.deskEvents.emit(request.workspaceId, { type: 'webhook', webhook: record });
    if (dedicated) {
      const thread = await this.getThread.execute({ id: threadId });
      this.deskEvents.emit(request.workspaceId, { type: 'thread', thread });
    }
    const thread = await this.getThread.execute({ id: threadId });
    return { webhook: record, thread };
  }
}
