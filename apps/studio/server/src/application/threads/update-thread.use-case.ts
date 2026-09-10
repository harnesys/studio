import type { ThreadRecord } from '@harnesys/studio-shared';
import type { RunEventStore, RunLifecycleStore } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import { GetThreadUseCase } from './get-thread.use-case.ts';

export type UpdateThreadRequest = {
  id: string;
  title?: string;
  agentId?: string;
  workspaceId?: string;
  pinned?: boolean;
};

export type UpdateThreadInput = {
  execute(request: UpdateThreadRequest): Promise<ThreadRecord>;
};

export class UpdateThreadUseCase implements UpdateThreadInput {
  private readonly getThread: GetThreadUseCase;

  constructor(
    private readonly threads: ThreadRepository,
    private readonly agents: AgentRepository,
    runEvents: RunEventStore,
    lifecycle: RunLifecycleStore,
  ) {
    this.getThread = new GetThreadUseCase(threads, agents, runEvents, lifecycle);
  }

  execute(request: UpdateThreadRequest): Promise<ThreadRecord> {
    const thread = this.threads.findById(request.id);
    if (!thread) {
      return Promise.reject(new NotFoundError('thread not found'));
    }
    if (request.title) {
      this.threads.updateTitle(request.id, request.title);
    }
    if (request.agentId) {
      const agent = this.agents.findById(request.agentId);
      if (!agent || agent.workspaceId !== thread.workspaceId) {
        return Promise.reject(new ValidationError('agent not found'));
      }
      this.threads.patch(request.id, { agentId: request.agentId });
    }
    if (request.pinned !== undefined) {
      this.threads.setPinned(request.id, request.pinned);
    }
    return this.getThread.execute({ id: request.id });
  }
}
