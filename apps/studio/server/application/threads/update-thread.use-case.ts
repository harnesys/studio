import type { ThreadRecord } from '../../../shared/types.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import { GetThreadUseCase } from './get-thread.use-case.ts';

export type UpdateThreadRequest = {
  id: string;
  title?: string;
  agentId?: string;
  workspaceId?: string;
};

export type UpdateThreadInput = {
  execute(request: UpdateThreadRequest): Promise<ThreadRecord>;
};

export class UpdateThreadUseCase implements UpdateThreadInput {
  private readonly getThread: GetThreadUseCase;

  constructor(
    private readonly threads: ThreadRepository,
    agents: AgentRepository,
  ) {
    this.getThread = new GetThreadUseCase(threads, agents);
  }

  execute(request: UpdateThreadRequest): Promise<ThreadRecord> {
    const thread = this.threads.findById(request.id);
    if (!thread) {
      return Promise.reject(new NotFoundError('thread not found'));
    }
    if (request.title) {
      this.threads.updateTitle(request.id, request.title);
    }
    return this.getThread.execute({ id: request.id });
  }
}
