import type { ThreadSummary } from '@harnesys/studio-shared';
import type { RunLifecycleStore } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import { activeRunOf } from './active-run-record.ts';
import { pinnedFields, readFields, runModeFields } from './thread.helpers.ts';
export type MarkThreadReadRequest = {
  id: string;
};
export type MarkThreadReadInput = {
  execute(request: MarkThreadReadRequest): Promise<ThreadSummary>;
};
export class MarkThreadReadUseCase implements MarkThreadReadInput {
  constructor(
    private readonly threads: ThreadRepository,
    private readonly agents: AgentRepository,
    private readonly lifecycle: RunLifecycleStore,
  ) {}
  async execute(request: MarkThreadReadRequest): Promise<ThreadSummary> {
    const thread = this.threads.findById(request.id);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }
    this.threads.markRead(request.id);
    const agent = this.agents.findById(thread.agentId);
    const active = await this.lifecycle.activeByThread(thread.id);
    return {
      id: thread.id,
      title: thread.title,
      agentId: thread.agentId,
      originAgentId: thread.originAgentId,
      agentName: agent?.name ?? '',
      workspaceId: thread.workspaceId,
      kind: thread.kind,
      parentThreadId: thread.parentThreadId ?? null,
      forkAt: thread.forkAt ?? null,
      inheritedEventCount: 0,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      ...readFields(thread),
      ...pinnedFields(thread),
      ...runModeFields(thread),
      activeRun: activeRunOf(active),
    };
  }
}
