import type { AgentRun, RuntimeHandle, SessionHandle } from 'harnesys';

export type ThreadOpenExtras = {
  onCompacted?: (range: unknown) => void | Promise<void>;
};

export class ThreadRuntimeRegistry {
  private readonly threads = new Map<string, Promise<SessionHandle>>();

  constructor(private readonly registry: { get(workspace: unknown): Promise<RuntimeHandle> }) {}

  threadOf(
    threadId: string,
    runtime: RuntimeHandle,
    _cwd?: string,
    _extras?: ThreadOpenExtras,
  ): Promise<SessionHandle> {
    const cached = this.threads.get(threadId);
    if (cached) return cached;

    const pending = Promise.resolve().then(() => {
      return runtime.session(threadId);
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
