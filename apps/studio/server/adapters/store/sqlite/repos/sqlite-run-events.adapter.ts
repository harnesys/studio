// biome-ignore-all lint/suspicious/useAwait: async required by RunEventStore port contract
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
  return (event as { clientEventId?: string }).clientEventId;
}

function rowToEvent(row: RunEventRow): SessionEvent {
  const meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
  return { ...(meta as object), type: row.type, seq: row.seq, runId: row.runId } as SessionEvent;
}

export class SqliteRunEventStore implements RunEventStore {
  constructor(private readonly db: StudioDb) {}

  /** Internal write inside the caller's transaction; returns assigned seq.
   *  Signature matches RunEventAppendWithinTx in sqlite-run-lifecycle.adapter.ts. */
  // biome-ignore lint/complexity/useMaxParams: seam signature (tx, runId, threadId, fromSeq, events)
  appendWithinTx(
    tx: StudioDb,
    runId: string,
    threadId: string,
    fromSeq: number,
    events: PendingSessionEvent[],
  ): SessionEvent[] {
    const now = Date.now();
    const assigned: SessionEvent[] = [];
    let seq = fromSeq;
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
      seq += 1;
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
      tx.update(runsTable)
        .set({ lastSeq: seq, updatedAt: new Date().toISOString() })
        .where(eq(runsTable.runId, runId))
        .run();
    }
    return assigned;
  }

  async append(
    runId: string,
    expectedEpoch: number,
    events: PendingSessionEvent[],
  ): Promise<SessionEvent[]> {
    return this.db.transaction((tx): SessionEvent[] => {
      const row = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
      if (row?.status !== 'running' || row?.leaseEpoch !== expectedEpoch) {
        throw codedRunError('lease_stale', `run ${runId} not executable by epoch ${expectedEpoch}`);
      }
      return this.appendWithinTx(tx as StudioDb, runId, row.threadId, row.lastSeq, events);
    });
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
    return rows.sort((a, b) => a.seq - b.seq || a.timestamp - b.timestamp).map(rowToEvent);
  }
}
