// biome-ignore-all lint/suspicious/useAwait: async required by RunLifecycleStore/RunEventStore port contracts
import { codedRunError } from '../domain/errors.ts';
import type { PendingSessionEvent, RunEventStore } from '../ports/run-event-store.ts';
import type {
  RunCreateInput,
  RunLifecycleStore,
  RunRecord,
  RunTransitionPatch,
} from '../ports/run-lifecycle-store.ts';
import { RUN_NON_TERMINAL } from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';

const DEFAULT_LIST_LIMIT = 50;
const DEFAULT_ASK_TTL_MS = 7 * 24 * 3600 * 1000;
function clientEventIdOf(event: PendingSessionEvent): string | undefined {
  return (event as { clientEventId?: string }).clientEventId;
}
function interruptIdOf(event: PendingSessionEvent | SessionEvent): string | undefined {
  return (event as { interruptId?: string }).interruptId;
}
function seqOf(event: SessionEvent): number {
  return (event as { seq?: number }).seq ?? 0;
}
export class InMemoryRunEventStore implements RunEventStore {
  events: Map<string, SessionEvent[]> = new Map();
  nextSeq: Map<string, number> = new Map();
  private insertion: Array<{ threadId: string; event: SessionEvent }> = [];
  private runs: Map<string, RunRecord> | null = null;
  attachLifecycleRuns(runs: Map<string, RunRecord>): void {
    this.runs = runs;
  }
  async append(
    runId: string,
    expectedEpoch: number,
    events: PendingSessionEvent[],
  ): Promise<SessionEvent[]> {
    const record = this.runs?.get(runId);
    if (record?.status !== 'running' || record.leaseEpoch !== expectedEpoch) {
      throw codedRunError('lease_stale', `run ${runId} is not leased for epoch ${expectedEpoch}`);
    }
    return this.appendLocked(runId, events);
  }
  appendLocked(runId: string, events: PendingSessionEvent[]): SessionEvent[] {
    const stored = this.events.get(runId) ?? [];
    const record = this.runs?.get(runId);
    let seq = this.nextSeq.get(runId) ?? 0;
    for (const event of events) {
      seq += 1;
      const full = { ...event, seq, runId } as SessionEvent;
      stored.push(full);
      this.insertion.push({ threadId: record?.threadId ?? '', event: full });
    }
    this.events.set(runId, stored);
    this.nextSeq.set(runId, seq);
    if (record) {
      record.lastSeq = seq;
    }
    return stored.slice(stored.length - events.length).map((event) => ({ ...event }));
  }
  async tail(runId: string, fromSeq: number): Promise<SessionEvent[]> {
    return (this.events.get(runId) ?? []).filter((event) => seqOf(event) > fromSeq);
  }
  async latestSeq(runId: string): Promise<number> {
    return this.nextSeq.get(runId) ?? 0;
  }
  async listByThread(threadId: string): Promise<SessionEvent[]> {
    return this.insertion.filter((e) => e.threadId === threadId).map((e) => e.event);
  }
}
function assertTransitionAllowed(
  record: RunRecord,
  expectedEpoch: number,
  patch: RunTransitionPatch,
): void {
  if (record.status === 'completed') {
    throw codedRunError('run_terminal', `run ${record.runId} is terminal`);
  }
  if (patch.to === 'queued' && record.status === 'queued') {
    throw codedRunError('already_queued', `run ${record.runId} is already queued`);
  }
  if (expectedEpoch !== record.leaseEpoch) {
    throw codedRunError('lease_stale', `run ${record.runId} epoch ${expectedEpoch} is stale`);
  }
  if (record.status !== patch.from) {
    throw codedRunError('already_resumed', `run ${record.runId} is ${record.status}`);
  }
  if (patch.to === 'queued' && record.interruptId !== undefined) {
    const first = patch.events?.[0];
    if (record.interruptId !== (first ? interruptIdOf(first) : undefined)) {
      throw codedRunError('unknown_interrupt', `run ${record.runId} interrupt mismatch`);
    }
  }
}
export class InMemoryRunLifecycleStore implements RunLifecycleStore {
  runs: Map<string, RunRecord> = new Map();
  eventsByClient: Map<string, string> = new Map();
  private readonly eventStore: InMemoryRunEventStore;
  constructor(eventStore: InMemoryRunEventStore) {
    this.eventStore = eventStore;
    eventStore.attachLifecycleRuns(this.runs);
  }
  async create(run: RunCreateInput, events: PendingSessionEvent[] = []): Promise<RunRecord> {
    for (const event of events) {
      const clientEventId = clientEventIdOf(event);
      if (clientEventId === undefined) {
        continue;
      }
      const key = `${run.threadId}:${clientEventId}`;
      const existing = this.eventsByClient.get(key);
      if (existing === undefined) {
        continue;
      }
      const record = this.runs.get(existing);
      if (record) {
        return { ...record };
      }
      this.eventsByClient.delete(key);
    }
    const now = new Date().toISOString();
    const record: RunRecord = {
      runId: run.runId,
      threadId: run.threadId,
      status: 'queued',
      attempt: 1,
      leaseEpoch: 0,
      lastSeq: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (run.parentRunId !== undefined) {
      record.parentRunId = run.parentRunId;
    }
    this.runs.set(run.runId, record);
    if (events.length > 0) {
      this.eventStore.appendLocked(run.runId, events);
    }
    for (const event of events) {
      const clientEventId = clientEventIdOf(event);
      if (clientEventId !== undefined) {
        this.eventsByClient.set(`${run.threadId}:${clientEventId}`, run.runId);
      }
    }
    return { ...record };
  }
  async get(runId: string): Promise<RunRecord | null> {
    const record = this.runs.get(runId);
    return record ? { ...record } : null;
  }
  async activeByThread(threadId: string): Promise<RunRecord | null> {
    let latest: RunRecord | null = null;
    for (const record of this.runs.values()) {
      if (record.threadId !== threadId || record.parentRunId !== undefined) {
        continue;
      }
      if (!RUN_NON_TERMINAL.includes(record.status)) {
        continue;
      }
      if (!latest || record.createdAt > latest.createdAt) {
        latest = record;
      }
    }
    return latest ? { ...latest } : null;
  }
  async childrenByParent(parentRunId: string): Promise<RunRecord[]> {
    const all = [...this.runs.values()].filter((record) => record.parentRunId === parentRunId);
    return all.map((record) => ({ ...record }));
  }
  async claim(runId: string, instanceId: string, ttlMs: number): Promise<RunRecord | null> {
    const record = this.runs.get(runId);
    if (record?.status !== 'queued') {
      return null;
    }
    record.status = 'running';
    record.leaseInstanceId = instanceId;
    record.leaseExpiresAt = Date.now() + ttlMs;
    record.leaseEpoch += 1;
    record.updatedAt = new Date().toISOString();
    return { ...record };
  }
  async transition(
    runId: string,
    expectedEpoch: number,
    patch: RunTransitionPatch,
  ): Promise<RunRecord> {
    const record = this.runs.get(runId);
    if (!record) {
      throw codedRunError('unknown_run', `run ${runId} not found`);
    }
    assertTransitionAllowed(record, expectedEpoch, patch);
    record.status = patch.to;
    if (patch.interruptId === null) {
      delete record.interruptId;
    } else if (patch.interruptId !== undefined) {
      record.interruptId = patch.interruptId;
    }
    if (patch.advanceAttempt) {
      record.attempt += 1;
    }
    // Spec ruling: epoch grows on every transition; handoff clears the lease.
    record.leaseEpoch += 1;
    delete record.leaseInstanceId;
    delete record.leaseExpiresAt;
    record.updatedAt = new Date().toISOString();
    if (patch.events && patch.events.length > 0) {
      this.eventStore.appendLocked(runId, patch.events);
    }
    return { ...record };
  }
  async renewLease(runId: string, instanceId: string, ttlMs: number): Promise<boolean> {
    const record = this.runs.get(runId);
    if (record?.leaseInstanceId !== instanceId) {
      return false;
    }
    record.leaseExpiresAt = Date.now() + ttlMs;
    return true;
  }
  private select(
    match: (record: RunRecord) => boolean,
    pick: (record: RunRecord) => string,
    limit?: number,
    before?: string,
  ): RunRecord[] {
    const out: RunRecord[] = [];
    for (const record of this.runs.values()) {
      if (!match(record)) {
        continue;
      }
      if (before !== undefined && !(pick(record) > before)) {
        continue;
      }
      out.push({ ...record });
    }
    const cmp = (a: RunRecord, b: RunRecord): number => pick(a).localeCompare(pick(b));
    return out.sort(cmp).slice(0, limit ?? DEFAULT_LIST_LIMIT);
  }
  async listClaimable(opts?: { limit?: number; before?: string }): Promise<RunRecord[]> {
    return this.select(
      (record) => record.status === 'queued',
      (record) => record.createdAt,
      opts?.limit,
      opts?.before,
    );
  }
  async listExpiredAsks(opts?: {
    limit?: number;
    before?: string;
    olderThanMs?: number;
  }): Promise<RunRecord[]> {
    const olderThanMs = opts?.olderThanMs ?? DEFAULT_ASK_TTL_MS;
    const now = Date.now();
    const oldAsk = (record: RunRecord): boolean =>
      record.status === 'needs_input' && now - Date.parse(record.updatedAt) > olderThanMs;
    return this.select(oldAsk, (record) => record.updatedAt, opts?.limit, opts?.before);
  }
}
export type RunEventBus = {
  publish(runId: string, events: SessionEvent[]): void;
  subscribe(runId: string): AsyncIterable<SessionEvent>;
};
type BusSubscriber = { queue: SessionEvent[]; wake: (() => void) | null };
export function createRunEventBus(): RunEventBus {
  const subscribers = new Map<string, Set<BusSubscriber>>();
  return {
    publish(runId: string, events: SessionEvent[]): void {
      for (const sub of subscribers.get(runId) ?? []) {
        sub.queue.push(...events);
        sub.wake?.();
        sub.wake = null;
      }
    },
    subscribe(runId: string): AsyncIterable<SessionEvent> {
      const live = subscribers.get(runId) ?? new Set<BusSubscriber>();
      subscribers.set(runId, live);
      const self: BusSubscriber = { queue: [], wake: null };
      live.add(self);
      return {
        async *[Symbol.asyncIterator]() {
          try {
            let index = 0;
            while (true) {
              for (; index < self.queue.length; index += 1) {
                yield self.queue[index] as SessionEvent;
              }
              await new Promise<void>((resolve) => {
                if (index < self.queue.length) {
                  resolve();
                } else {
                  self.wake = resolve;
                }
              });
            }
          } finally {
            live.delete(self);
          }
        },
      };
    },
  };
}
