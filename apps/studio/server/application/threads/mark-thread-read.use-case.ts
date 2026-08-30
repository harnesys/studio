import type { ThreadRecord } from '../../../shared/types.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import { GetThreadUseCase } from './get-thread.use-case.ts';

export type MarkThreadReadRequest = {
  id: string;
};

export type MarkThreadReadInput = {
  execute(request: MarkThreadReadRequest): Promise<ThreadRecord>;
};

export class MarkThreadReadUseCase implements MarkThreadReadInput {
  private readonly getThread: GetThreadUseCase;

  constructor(
    private readonly threads: ThreadRepository,
    agents: AgentRepository,
  ) {
    this.getThread = new GetThreadUseCase(threads, agents);
  }

  execute(request: MarkThreadReadRequest): Promise<ThreadRecord> {
    const thread = this.threads.findById(request.id);
    if (!thread) {
      return Promise.reject(new NotFoundError('thread not found'));
    }
    this.threads.markRead(request.id);
    return this.getThread.execute({ id: request.id });
  }
}
