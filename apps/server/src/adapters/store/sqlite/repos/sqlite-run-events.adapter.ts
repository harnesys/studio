import { and, eq, gt } from 'drizzle-orm';
import {
  codedRunError,
  type PendingSessionEvent,
  type RunEventStore,
  type SessionEvent,
} from 'harnesys';
import type { StudioDb } from '../connection.ts';
import { type RunEventRow, runEventsTable } from '../schema/run-events.ts';
import { runsTable } from '../schema/runs.ts';

function clientEventIdOf(event: PendingSessionEvent): string | undefined {
  return (
    event as {
      clientEventId?: string;
    }
  ).clientEventId;
}
function seqOf(event: PendingSessionEvent | SessionEvent): number {
  return (
    (
      event as {
        seq?: number;
      }
    ).seq ?? 0
  );
}
function rowToEvent(row: RunEventRow): SessionEvent {
  const meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
  return { ...(meta as object), type: row.type, seq: row.seq, runId: row.runId } as SessionEvent;
}
export class SqliteRunEventStore implements RunEventStore {
  private readonly seqByRun = new Map<string, number>();
  constructor(private readonly db: StudioDb) {}
  private lastSeqOf(runId: string, tx: StudioDb): number {
    const known = this.seqByRun.get(runId);
    if (known !== undefined) {
      return known;
    }
    const row = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
    return row?.lastSeq ?? 0;
  }
  private bump(runId: string, seq: number): void {
    const known = this.seqByRun.get(runId) ?? 0;
    if (seq > known) {
      this.seqByRun.set(runId, seq);
    }
  }
  next(runId: string): number {
    const seq = this.lastSeqOf(runId, this.db) + 1;
    this.bump(runId, seq);
    return seq;
  }
  appendWithinTx(
    tx: StudioDb,
    runId: string,
    threadId: string,
    events: PendingSessionEvent[],
  ): SessionEvent[] {
    const now = Date.now();
    const assigned: SessionEvent[] = [];
    let counter = this.lastSeqOf(runId, tx);
    let persistedMax =
      tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get()?.lastSeq ?? 0;
    for (const pending of events) {
      const clientEventId = clientEventIdOf(pending);
      if (clientEventId !== undefined) {
        const existing = tx
          .select()
          .from(runEventsTable)
          .where(
            and(
              eq(runEventsTable.threadId, threadId),
              eq(runEventsTable.clientEventId, clientEventId),
            ),
          )
          .get();
        if (existing) {
          assigned.push(rowToEvent(existing));
          continue;
        }
      }
      const pre = seqOf(pending);
      const seq = pre > 0 ? pre : counter + 1;
      if (seq > counter) {
        counter = seq;
      }
      if (seq > persistedMax) {
        persistedMax = seq;
      }
      const full = { ...pending, seq, runId } as SessionEvent;
      const meta = { ...pending };
      tx.insert(runEventsTable)
        .values({
          runId,
          seq,
          threadId,
          type: pending.type,
          timestamp: now,
          metadata: JSON.stringify(meta),
          clientEventId: clientEventId ?? null,
        })
        .run();
      assigned.push(full);
    }
    if (events.length > 0) {
      this.bump(runId, counter);
      tx.update(runsTable)
        .set({ lastSeq: persistedMax, updatedAt: new Date().toISOString() })
        .where(eq(runsTable.runId, runId))
        .run();
    }
    return assigned;
  }
  async append(
    runId: string,
    expectedEpoch: number,
    events: SessionEvent[],
  ): Promise<SessionEvent[]> {
    return this.db.transaction((tx): SessionEvent[] => {
      const row = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
      if (row?.status !== 'running' || row?.leaseEpoch !== expectedEpoch) {
        throw codedRunError('lease_stale', `run ${runId} not executable by epoch ${expectedEpoch}`);
      }
      return this.appendWithinTx(tx as StudioDb, runId, row.threadId, events);
    });
  }
  appendForThread(threadId: string, runId: string, events: PendingSessionEvent[]): SessionEvent[] {
    return this.db.transaction((tx): SessionEvent[] =>
      this.appendWithinTx(tx as StudioDb, runId, threadId, events),
    );
  }
  async tail(runId: string, fromSeq: number): Promise<SessionEvent[]> {
    const rows = this.db
      .select()
      .from(runEventsTable)
      .where(and(eq(runEventsTable.runId, runId), gt(runEventsTable.seq, fromSeq)))
      .all();
    return rows.map(rowToEvent);
  }
  async latestSeq(runId: string): Promise<number> {
    const row = this.db.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
    return row?.lastSeq ?? 0;
  }
  async listByThread(threadId: string): Promise<SessionEvent[]> {
    const rows = this.db
      .select()
      .from(runEventsTable)
      .where(eq(runEventsTable.threadId, threadId))
      .all();
    return rows.sort((a, b) => a.timestamp - b.timestamp || a.seq - b.seq).map(rowToEvent);
  }
  async hasRun(runId: string): Promise<boolean> {
    const row = this.db
      .select({ seq: runEventsTable.seq })
      .from(runEventsTable)
      .where(eq(runEventsTable.runId, runId))
      .limit(1)
      .get();
    return row !== undefined;
  }
}
