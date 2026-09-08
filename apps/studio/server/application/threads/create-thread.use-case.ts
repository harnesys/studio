import type { ThreadKind, ThreadRecord } from '../../../shared/types.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export const DEFAULT_THREAD_TITLE = 'New thread';

export type CreateThreadRequest = {
  title?: string;
  agentId?: string;
  originAgentId?: string;
  workspaceId?: string;
  kind?: ThreadKind;
  parentThreadId?: string;
  forkAt?: string;
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
    const originAgentId = request.originAgentId ?? agent.id;
    const origin = originAgentId === agent.id ? agent : this.agents.findById(originAgentId);
    if (!origin || origin.workspaceId !== workspaceId) {
      throw new ValidationError('origin agent not found');
    }
    let parentThreadId: string | null = null;
    let forkAt: string | null = null;
    if (request.parentThreadId) {
      const parent = this.threads.findById(request.parentThreadId);
      if (!parent || parent.workspaceId !== workspaceId) {
        throw new ValidationError('parent thread not found');
      }
      parentThreadId = parent.id;
      forkAt = request.forkAt?.trim() ? request.forkAt.trim() : null;
    } else if (request.forkAt?.trim()) {
      throw new ValidationError('parent required for fork');
    }
    const kind = request.kind ?? 'chat';
    const now = new Date().toISOString();
    const thread = this.threads.insert({
      id: crypto.randomUUID(),
      workspaceId,
      agentId: agent.id,
      originAgentId: origin.id,
      title: request.title ?? DEFAULT_THREAD_TITLE,
      kind,
      parentThreadId,
      forkAt,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      lastReadAt: now,
    });
    return await Promise.resolve({
      id: thread.id,
      title: thread.title,
      agentId: thread.agentId,
      originAgentId: thread.originAgentId,
      agentName: agent.name,
      workspaceId: thread.workspaceId,
      kind: thread.kind,
      parentThreadId: thread.parentThreadId ?? null,
      forkAt: thread.forkAt ?? null,
      inheritedEventCount: 0,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      pinned: false,
      lastReadAt: thread.lastReadAt,
      unread: false,
      events: [],
      activeRun: null,
    });
  }
}
