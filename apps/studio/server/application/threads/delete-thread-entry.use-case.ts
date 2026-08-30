import { isHumanEntry, type Journal } from 'harnesys';
import type { ThreadRecord } from '../../../shared/types.ts';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import type { JournalRepository } from '../../domain/journal.port.ts';
import { ConflictError, NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';

export type DeleteThreadEntryRequest = {
  threadId: string;
  entryId: string;
};

export type DeleteThreadEntryInput = {
  execute(request: DeleteThreadEntryRequest): Promise<ThreadRecord>;
};

export class DeleteThreadEntryUseCase implements DeleteThreadEntryInput {
  constructor(
    private readonly threads: ThreadRepository,
    private readonly journal: JournalRepository,
    private readonly activeRuns: ActiveRunRegistry,
    private readonly getThread: GetThreadInput,
  ) {}

  execute(request: DeleteThreadEntryRequest) {
    const thread = this.threads.findById(request.threadId);
    if (!thread) {
      return Promise.reject(new NotFoundError('thread not found'));
    }
    if (this.activeRuns.findByThread(request.threadId)) {
      return Promise.reject(new ConflictError('thread has a live run'));
    }

    const journal = this.journal.load(request.threadId);
    const next = cutTurn(journal, request.entryId);
    this.journal.saveSnapshot(request.threadId, next);
    this.threads.touch(request.threadId);
    return this.getThread.execute({ id: request.threadId });
  }
}

function cutTurn(journal: Journal, entryId: string): Journal {
  const entries = journal.entries;
  const hit = entries.findIndex((entry) => entry.id === entryId);
  if (hit < 0) {
    throw new NotFoundError('entry not found');
  }

  let from = hit;
  for (let i = hit; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry && isHumanEntry(entry)) {
      from = i;
      break;
    }
  }

  let end = entries.length;
  for (let i = from + 1; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry && isHumanEntry(entry)) {
      end = i;
      break;
    }
  }

  return {
    ...journal,
    entries: [...entries.slice(0, from), ...entries.slice(end)],
  };
}
