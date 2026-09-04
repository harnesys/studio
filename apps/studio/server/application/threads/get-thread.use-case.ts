import type { RunEventStore, RunLifecycleStore } from 'harnesys';
import type { ThreadRecord } from '../../../shared/types.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import { activeRunOf } from './active-run-record.ts';
import { readFields } from './thread.helpers.ts';

export type GetThreadRequest = {
  id: string;
};

export type GetThreadInput = {
  execute(request: GetThreadRequest): Promise<ThreadRecord>;
};

export class GetThreadUseCase implements GetThreadInput {
  constructor(
    private readonly threads: ThreadRepository,
    private readonly agents: AgentRepository,
    private readonly runEvents: RunEventStore,
    private readonly lifecycle: RunLifecycleStore,
  ) {}

  async execute(request: GetThreadRequest): Promise<ThreadRecord> {
    const thread = this.threads.findById(request.id);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }
    const agent = this.agents.findById(thread.agentId);

    const [events, active] = await Promise.all([
      this.runEvents.listByThread(thread.id),
      this.lifecycle.activeByThread(thread.id),
    ]);

    return {
      id: thread.id,
      title: thread.title,
      agentId: thread.agentId,
      agentName: agent?.name ?? '',
      workspaceId: thread.workspaceId,
      kind: thread.kind,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      ...readFields(thread),
      events,
      activeRun: activeRunOf(active),
    };
  }
}
