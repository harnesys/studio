import type { ThreadKind, ThreadRecord } from '../../../shared/types.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type CreateThreadRequest = {
  title?: string;
  agentId?: string;
  workspaceId?: string;
  kind?: ThreadKind;
};

export type CreateThreadInput = {
  execute(request: CreateThreadRequest): Promise<ThreadRecord>;
};

export class CreateThreadUseCase implements CreateThreadInput {
  constructor(
    private readonly threads: ThreadRepository,
    private readonly agents: AgentRepository,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  async execute(request: CreateThreadRequest): Promise<ThreadRecord> {
    const workspaces = this.workspaces.list();
    const workspaceId = request.workspaceId ?? workspaces[0]?.id;
    if (!workspaceId) {
      throw new ValidationError('workspace required');
    }
    const agent = this.agents.findById(request.agentId ?? '');
    if (!agent || agent.workspaceId !== workspaceId) {
      throw new ValidationError('agent not found');
    }
    const kind = request.kind ?? 'chat';
    const now = new Date().toISOString();
    const thread = this.threads.insert({
      id: crypto.randomUUID(),
      workspaceId,
      agentId: agent.id,
      title: request.title ?? 'New thread',
      kind,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      lastReadAt: now,
    });
    return await Promise.resolve({
      id: thread.id,
      title: thread.title,
      agentId: thread.agentId,
      agentName: agent.name,
      workspaceId: thread.workspaceId,
      kind: thread.kind,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      lastReadAt: thread.lastReadAt,
      unread: false,
      events: [],
    });
  }
}
