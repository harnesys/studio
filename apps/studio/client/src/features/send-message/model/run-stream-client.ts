import type { SessionEvent } from '@studio/shared';
import type { useSessionStore } from '@/entities/session';
import {
  ApiError,
  cancelRun,
  getRunEventsStream,
  getThread,
  readSse,
  rejectRun,
  respondToRun,
} from '@/shared/api';

export type RunStreamState =
  | 'connecting'
  | 'queued'
  | 'live'
  | 'paused'
  | 'reconnecting'
  | 'terminal'
  | 'offline';

export type SessionStoreApi = ReturnType<typeof useSessionStore.getState>;

export type RunStreamClientDeps = {
  threadId: string;
  store: SessionStoreApi;
  onEvent: (event: SessionEvent) => void;
  /** Fires once when the connected run reaches a terminal state. */
  onTerminal: (runId: string) => void;
};

export type RunStreamClient = {
  /** Idempotent: second connect to the same runId is ignored. */
  connect(runId: string, fromSeq?: number): void;
  respond(askId: string, payload: unknown, opts?: { clientEventId?: string }): Promise<void>;
  reject(askId: string, note?: string, opts?: { clientEventId?: string }): Promise<void>;
  cancel(): Promise<void>;
  /** Manual retry after offline. */
  reconnect(): void;
  stop(): void;
  getState(): RunStreamState;
  onTransition(listener: (state: RunStreamState) => void): () => void;
};

const lastSeqByRun = new Map<string, number>();
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const MAX_FAILURES = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

function parseJson<T>(data: string): T | undefined {
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}

class StreamClient implements RunStreamClient {
  private readonly threadId: string;
  private readonly onEvent: (event: SessionEvent) => void;
  private readonly onTerminal: (runId: string) => void;
  private state: RunStreamState = 'connecting';
  private currentRunId: string | undefined;
  private controller: AbortController | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<(state: RunStreamState) => void>();
  private failures = 0;
  private terminated = false;
  private opening = 0;

  constructor(deps: RunStreamClientDeps) {
    this.threadId = deps.threadId;
    this.onEvent = deps.onEvent;
    this.onTerminal = deps.onTerminal;
  }

  connect(runId: string, fromSeq?: number): void {
    if (this.currentRunId === runId && this.state !== 'terminal' && this.state !== 'offline') {
      return;
    }
    this.start(runId, fromSeq ?? lastSeqByRun.get(runId) ?? 0);
  }

  respond(askId: string, payload: unknown, opts?: { clientEventId?: string }): Promise<void> {
    return this.mutate((runId) => respondToRun(runId, askId, payload, opts));
  }

  reject(askId: string, note?: string, opts?: { clientEventId?: string }): Promise<void> {
    return this.mutate((runId) => rejectRun(runId, askId, note, opts));
  }

  cancel(): Promise<void> {
    return this.mutate((runId) => cancelRun(runId));
  }

  reconnect(): void {
    this.failures = 0;
    if (this.currentRunId && this.state !== 'terminal') {
      this.start(this.currentRunId, lastSeqByRun.get(this.currentRunId) ?? 0);
    }
  }

  stop(): void {
    this.reset();
    this.currentRunId = undefined;
  }

  getState(): RunStreamState {
    return this.state;
  }

  onTransition(listener: (state: RunStreamState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** POST then reconnect the tail; 409 also reconnects, never retries. Other errors throw. */
  private async mutate(call: (runId: string) => Promise<void>): Promise<void> {
    const runId = this.currentRunId;
    if (!runId) {
      return;
    }
    try {
      await call(runId);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) {
        throw error;
      }
    }
    this.start(runId, lastSeqByRun.get(runId) ?? 0);
  }

  private setState(next: RunStreamState): void {
    if (this.state === next) {
      return;
    }
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  private reset(): void {
    this.opening += 1;
    this.controller?.abort();
    this.controller = undefined;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private start(runId: string, fromSeq: number): void {
    this.reset();
    this.currentRunId = runId;
    this.terminated = false;
    this.setState('connecting');
    void this.open(runId, fromSeq, this.opening);
  }

  private async open(runId: string, fromSeq: number, token: number): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    let response: Response;
    try {
      response = await getRunEventsStream(runId, fromSeq, controller.signal);
    } catch (error) {
      if (token !== this.opening || controller.signal.aborted) {
        return;
      }
      if (error instanceof ApiError && error.status === 410) {
        this.finishTerminal();
        return;
      }
      await this.onSilentDrop(runId, token);
      return;
    }
    if (token !== this.opening) {
      controller.abort();
      return;
    }
    let paused = false;
    try {
      for await (const frame of readSse(response)) {
        if (token !== this.opening) {
          return;
        }
        if (this.state === 'connecting') {
          this.setState('queued');
        }
        if (frame.event === 'run-paused') {
          paused = true;
          this.onRunPaused(frame.data);
          return;
        }
        const event = parseJson<SessionEvent>(frame.data);
        if (!event) {
          continue;
        }
        if (typeof event.seq === 'number') {
          lastSeqByRun.set(runId, event.seq);
        }
        this.onEvent(event);
        if (event.type === 'run.started') {
          this.failures = 0;
          this.setState('live');
        }
      }
    } catch {
      if (token !== this.opening || controller.signal.aborted) {
        return;
      }
      await this.onSilentDrop(runId, token);
      return;
    }
    if (token !== this.opening || controller.signal.aborted || paused) {
      return;
    }
    await this.onSilentDrop(runId, token);
  }

  private onRunPaused(data: string): void {
    const parsed = parseJson<{ runId?: string; status?: string }>(data);
    if (parsed?.status && TERMINAL_STATUSES.has(parsed.status)) {
      this.finishTerminal();
      return;
    }
    this.setState('paused');
  }

  private async onSilentDrop(runId: string, token: number): Promise<void> {
    let status: string | null = null;
    try {
      const record = await getThread(this.threadId);
      if (token !== this.opening) {
        return;
      }
      status = record.activeRun?.status ?? null;
    } catch {
      if (token !== this.opening) {
        return;
      }
      this.scheduleReconnect(runId);
      return;
    }
    if (status === null) {
      this.finishTerminal();
      return;
    }
    if (status === 'needs_input') {
      this.setState('paused');
      return;
    }
    this.scheduleReconnect(runId);
  }

  private scheduleReconnect(runId: string): void {
    this.failures += 1;
    if (this.failures >= MAX_FAILURES) {
      this.setState('offline');
      return;
    }
    this.setState('reconnecting');
    const token = this.opening;
    this.timer = setTimeout(
      () => {
        if (token !== this.opening) {
          return;
        }
        this.setState('connecting');
        void this.open(runId, lastSeqByRun.get(runId) ?? 0, token);
      },
      Math.min(BASE_BACKOFF_MS * 2 ** (this.failures - 1), MAX_BACKOFF_MS),
    );
  }

  private finishTerminal(): void {
    this.setState('terminal');
    if (!this.terminated) {
      this.terminated = true;
      this.onTerminal(this.currentRunId ?? '');
    }
  }
}

export function createRunStreamClient(deps: RunStreamClientDeps): RunStreamClient {
  return new StreamClient(deps);
}
