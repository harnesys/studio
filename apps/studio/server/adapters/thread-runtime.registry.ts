import { type CompactedRangeNotify, reconcileStaleRunning } from 'harnesys';
import type { AgentHandle, ThreadHandle } from 'harnesys';
import type { JournalRepository } from '../domain/journal.port.ts';

import { createWorkspaceFileReader } from './workspace-file-reader.ts';

export type ThreadOnCompacted = (range: CompactedRangeNotify) => void | Promise<void>;

export type ThreadOpenExtras = {
  onCompacted?: ThreadOnCompacted;
};

/**
 * Host map of live ThreadHandles.
 * One owning process node; cold start loads journal from persist.
 */
export class ThreadRuntimeRegistry {
  private readonly threads = new Map<string, Promise<ThreadHandle>>();
  /** Latest host hook per thread; stable wrapper on the cached handle reads this. */
  private readonly onCompactedByThread = new Map<string, ThreadOnCompacted>();

  constructor(private readonly journal: JournalRepository) {}

  threadOf(
    threadId: string,
    agent: AgentHandle,
    cwd?: string,
    extras?: ThreadOpenExtras,
  ): Promise<ThreadHandle> {
    if (extras?.onCompacted) {
      this.onCompactedByThread.set(threadId, extras.onCompacted);
    }

    const cached = this.threads.get(threadId);
    if (cached) {
      return cached;
    }

    const pending = Promise.resolve().then(() => {
      const journal = this.journal.load(threadId);
      reconcileStaleRunning(journal);
      return agent.thread({
        id: threadId,
        journal,
        cwd,
        fileReader: createWorkspaceFileReader(cwd),
        onCompacted: (range: CompactedRangeNotify) =>
          this.onCompactedByThread.get(threadId)?.(range),
      });
    });

    this.threads.set(threadId, pending);
    pending.catch(() => {
      if (this.threads.get(threadId) === pending) {
        this.threads.delete(threadId);
        this.onCompactedByThread.delete(threadId);
      }
    });
    return pending;
  }

  forget(threadId: string): void {
    this.threads.delete(threadId);
    this.onCompactedByThread.delete(threadId);
  }
}
