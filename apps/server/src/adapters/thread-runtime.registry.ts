import type { RuntimeHandle, SessionHandle } from 'harnesys';
import type { SqliteRuntimeState } from './store/sqlite/repos/sqlite-runtime-state.repo.ts';

export class ThreadRuntimeRegistry {
  private readonly threads = new Map<string, Promise<SessionHandle>>();

  constructor(private readonly stateFactory: { forState(threadId: string): SqliteRuntimeState }) {}

  threadOf(
    threadId: string,
    runtime: RuntimeHandle,
    agentId: string,
    _cwd?: string,
  ): Promise<SessionHandle> {
    const cached = this.threads.get(threadId);
    if (cached) {
      return cached;
    }

    const pending = Promise.resolve().then(() => {
      const state = this.stateFactory.forState(threadId);
      return runtime.session(agentId, { state });
    });

    this.threads.set(threadId, pending);
    pending.catch(() => {
      if (this.threads.get(threadId) === pending) {
        this.threads.delete(threadId);
      }
    });
    return pending;
  }

  forget(threadId: string): void {
    this.threads.delete(threadId);
  }
}
