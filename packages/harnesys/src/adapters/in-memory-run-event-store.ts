import { codedRunError } from '../domain/errors.ts';
import type { PendingSessionEvent, RunEventStore } from '../ports/run-event-store.ts';
import type { RunRecord } from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';

function seqOf(event: SessionEvent): number {
  return (
    (
      event as {
        seq?: number;
      }
    ).seq ?? 0
  );
}

export class InMemoryRunEventStore implements RunEventStore {
  events: Map<string, SessionEvent[]> = new Map();
  nextSeq: Map<string, number> = new Map();
  private insertion: Array<{
    threadId: string;
    event: SessionEvent;
  }> = [];
  private runs: Map<string, RunRecord> | null = null;
  attachLifecycleRuns(runs: Map<string, RunRecord>): void {
    this.runs = runs;
  }
  append(runId: string, expectedEpoch: number, events: SessionEvent[]): Promise<SessionEvent[]> {
    const record = this.runs?.get(runId);
    if (record?.status !== 'running' || record.leaseEpoch !== expectedEpoch) {
      return Promise.reject(
        codedRunError('lease_stale', `run ${runId} is not leased for epoch ${expectedEpoch}`),
      );
    }
    return Promise.resolve(this.appendLocked(runId, events));
  }
  appendForThread(
    threadId: string,
    runId: string,
    events: PendingSessionEvent[],
  ): Promise<SessionEvent[]> {
    void threadId;
    return Promise.resolve(this.appendLocked(runId, events));
  }
  next(runId: string): number {
    const seq = (this.nextSeq.get(runId) ?? 0) + 1;
    this.nextSeq.set(runId, seq);
    return seq;
  }
  appendLocked(runId: string, events: PendingSessionEvent[]): SessionEvent[] {
    const stored = this.events.get(runId) ?? [];
    const record = this.runs?.get(runId);
    let maxSeq = this.nextSeq.get(runId) ?? 0;
    const assigned: SessionEvent[] = [];
    for (const event of events) {
      const pre = seqOf(event as SessionEvent);
      const seq = pre > 0 ? pre : maxSeq + 1;
      if (seq > maxSeq) {
        maxSeq = seq;
      }
      const full = { ...event, seq, runId } as SessionEvent;
      stored.push(full);
      this.insertion.push({ threadId: record?.threadId ?? '', event: full });
      assigned.push(full);
    }
    this.events.set(runId, stored);
    this.nextSeq.set(runId, maxSeq);
    if (record) {
      record.lastSeq = maxSeq;
    }
    return assigned.map((event) => ({ ...event }));
  }
  tail(runId: string, fromSeq: number): Promise<SessionEvent[]> {
    return Promise.resolve(
      (this.events.get(runId) ?? []).filter((event) => seqOf(event) > fromSeq),
    );
  }
  latestSeq(runId: string): Promise<number> {
    return Promise.resolve(this.nextSeq.get(runId) ?? 0);
  }
  listByThread(threadId: string): Promise<SessionEvent[]> {
    return Promise.resolve(
      this.insertion.filter((e) => e.threadId === threadId).map((e) => e.event),
    );
  }
  hasRun(runId: string): Promise<boolean> {
    const stored = this.events.get(runId);
    return Promise.resolve(stored !== undefined && stored.length > 0);
  }
}
