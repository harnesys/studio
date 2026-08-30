import type { AgentRun, SessionEvent } from 'harnesys';

type EventListener = (event: SessionEvent) => void;

type ActiveRunState = {
  runId: string;
  threadId: string;
  run: AgentRun;
  controller: AbortController;
  listeners: Set<EventListener>;
};

export class ActiveRunRegistry {
  private readonly active = new Map<string, ActiveRunState>();
  private readonly idleListeners = new Set<(threadId: string) => void>();

  onThreadIdle(listener: (threadId: string) => void): () => void {
    this.idleListeners.add(listener);
    return () => {
      this.idleListeners.delete(listener);
    };
  }

  register(
    runId: string,
    threadId: string,
    run: AgentRun,
    controller = new AbortController(),
  ): { controller: AbortController; signal: AbortSignal } {
    const existing = this.active.get(runId);
    if (existing) {
      return { controller: existing.controller, signal: existing.controller.signal };
    }
    this.active.set(runId, {
      runId,
      threadId,
      run,
      controller,
      listeners: new Set(),
    });
    return { controller, signal: controller.signal };
  }

  get(runId: string): ActiveRunState | undefined {
    return this.active.get(runId);
  }

  findByThread(threadId: string): ActiveRunState | undefined {
    for (const item of this.active.values()) {
      if (item.threadId === threadId) {
        return item;
      }
    }
    return undefined;
  }

  cancel(runId: string): boolean {
    const item = this.active.get(runId);
    if (!item) {
      return false;
    }
    item.run.cancel();
    item.controller.abort();
    return true;
  }

  cancelByThread(threadId: string): void {
    for (const item of this.active.values()) {
      if (item.threadId === threadId) {
        item.run.cancel();
        item.controller.abort();
      }
    }
  }

  finish(runId: string): void {
    const item = this.active.get(runId);
    this.active.delete(runId);
    if (!item) {
      return;
    }
    if (this.findByThread(item.threadId)) {
      return;
    }
    for (const listener of this.idleListeners) {
      try {
        listener(item.threadId);
      } catch {}
    }
  }

  subscribe(runId: string, listener: EventListener): () => void {
    const item = this.active.get(runId);
    if (!item) {
      return () => {};
    }
    item.listeners.add(listener);
    return () => {
      item.listeners.delete(listener);
    };
  }

  emit(runId: string, event: SessionEvent): void {
    const item = this.active.get(runId);
    if (!item) {
      return;
    }
    for (const listener of item.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }
}
