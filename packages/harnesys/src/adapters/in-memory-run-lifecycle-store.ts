import { DEFAULT_ASK_TTL_MS, DEFAULT_LIST_LIMIT, RUN_NON_TERMINAL } from '../constants.ts';
import { codedRunError } from '../domain/errors.ts';
import type { PendingSessionEvent } from '../ports/run-event-store.ts';
import type {
  RunCreateInput,
  RunLifecycleStore,
  RunRecord,
  RunTransitionPatch,
} from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';
import type { InMemoryRunEventStore } from './in-memory-run-event-store.ts';

function clientEventIdOf(event: PendingSessionEvent): string | undefined {
  return (
    event as {
      clientEventId?: string;
    }
  ).clientEventId;
}
function interruptIdOf(event: PendingSessionEvent | SessionEvent): string | undefined {
  return (
    event as {
      interruptId?: string;
    }
  ).interruptId;
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
  create(run: RunCreateInput, events: PendingSessionEvent[] = []): Promise<RunRecord> {
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
        return Promise.resolve({ ...record });
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
    return Promise.resolve({ ...record });
  }
  get(runId: string): Promise<RunRecord | null> {
    const record = this.runs.get(runId);
    return Promise.resolve(record ? { ...record } : null);
  }
  activeByThread(threadId: string): Promise<RunRecord | null> {
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
    return Promise.resolve(latest ? { ...latest } : null);
  }
  childrenByParent(parentRunId: string): Promise<RunRecord[]> {
    const all = [...this.runs.values()].filter((record) => record.parentRunId === parentRunId);
    return Promise.resolve(all.map((record) => ({ ...record })));
  }
  claim(runId: string, instanceId: string, ttlMs: number): Promise<RunRecord | null> {
    const record = this.runs.get(runId);
    if (record?.status !== 'queued') {
      return Promise.resolve(null);
    }
    record.status = 'running';
    record.leaseInstanceId = instanceId;
    record.leaseExpiresAt = Date.now() + ttlMs;
    record.leaseEpoch += 1;
    record.updatedAt = new Date().toISOString();
    return Promise.resolve({ ...record });
  }
  transition(runId: string, expectedEpoch: number, patch: RunTransitionPatch): Promise<RunRecord> {
    const record = this.runs.get(runId);
    if (!record) {
      return Promise.reject(codedRunError('unknown_run', `run ${runId} not found`));
    }
    assertTransitionAllowed(record, expectedEpoch, patch);
    record.status = patch.to;
    if (patch.interruptId === null) {
      delete record.interruptId;
    } else if (patch.interruptId !== undefined) {
      record.interruptId = patch.interruptId;
    }
    if (patch.waitFireAt === null) {
      delete record.waitFireAt;
    } else if (patch.waitFireAt !== undefined) {
      record.waitFireAt = patch.waitFireAt;
    }
    if (patch.advanceAttempt) {
      record.attempt += 1;
    }
    record.leaseEpoch += 1;
    delete record.leaseInstanceId;
    delete record.leaseExpiresAt;
    record.updatedAt = new Date().toISOString();
    if (patch.events && patch.events.length > 0) {
      this.eventStore.appendLocked(runId, patch.events);
    }
    return Promise.resolve({ ...record });
  }
  renewLease(runId: string, instanceId: string, ttlMs: number): Promise<boolean> {
    const record = this.runs.get(runId);
    if (record?.leaseInstanceId !== instanceId) {
      return Promise.resolve(false);
    }
    const epochBefore = record.leaseEpoch;
    record.leaseExpiresAt = Date.now() + ttlMs;
    return Promise.resolve(record.leaseEpoch === epochBefore);
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
  listClaimable(opts?: { limit?: number; before?: string }): Promise<RunRecord[]> {
    return Promise.resolve(
      this.select(
        (record) => record.status === 'queued' && record.parentRunId === undefined,
        (record) => record.createdAt,
        opts?.limit,
        opts?.before,
      ),
    );
  }
  listExpiredAsks(opts?: {
    limit?: number;
    before?: string;
    olderThanMs?: number;
  }): Promise<RunRecord[]> {
    const olderThanMs = opts?.olderThanMs ?? DEFAULT_ASK_TTL_MS;
    const now = Date.now();
    const oldAsk = (record: RunRecord): boolean =>
      record.status === 'needs_input' && now - Date.parse(record.updatedAt) > olderThanMs;
    return Promise.resolve(
      this.select(oldAsk, (record) => record.updatedAt, opts?.limit, opts?.before),
    );
  }
  listDueTimers(opts?: { limit?: number; now?: number }): Promise<RunRecord[]> {
    const now = opts?.now ?? Date.now();
    const due = (record: RunRecord): boolean =>
      record.status === 'waiting' &&
      typeof record.waitFireAt === 'number' &&
      record.waitFireAt <= now;
    const out: RunRecord[] = [];
    for (const record of this.runs.values()) {
      if (!due(record)) {
        continue;
      }
      out.push({ ...record });
    }
    out.sort((a, b) => (a.waitFireAt ?? 0) - (b.waitFireAt ?? 0));
    return Promise.resolve(out.slice(0, opts?.limit ?? DEFAULT_LIST_LIMIT));
  }
}
