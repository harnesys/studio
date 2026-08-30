import { eq } from 'drizzle-orm';
import type { CommitMeta, Event, RuntimeState, Snapshot } from 'harnesys';
import type { StudioDb } from '../connection.ts';
import { eventsTable } from '../schema/events.ts';
import { snapshotsTable } from '../schema/snapshots.ts';

export class SqliteRuntimeState implements RuntimeState {
  readonly sessionId: string;

  constructor(
    private readonly db: StudioDb,
    private readonly threadId: string,
    sessionId?: string,
  ) {
    this.sessionId = sessionId ?? crypto.randomUUID();
  }

  async load(): Promise<Snapshot | null> {
    const row = this.db
      .select()
      .from(snapshotsTable)
      .where(eq(snapshotsTable.sessionId, this.sessionId))
      .get();
    if (!row) {
      return null;
    }
    return JSON.parse(row.snapshot) as Snapshot;
  }

  async commit(snapshot: Snapshot, events: readonly Event[], meta: CommitMeta): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .insert(snapshotsTable)
      .values({
        sessionId: this.sessionId,
        threadId: this.threadId,
        snapshot: JSON.stringify(snapshot),
        sequence: meta.sequence,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: snapshotsTable.sessionId,
        set: {
          snapshot: JSON.stringify(snapshot),
          sequence: meta.sequence,
          updatedAt: now,
        },
      })
      .run();

    for (const event of events) {
      this.db
        .insert(eventsTable)
        .values({
          eventId: event.eventId,
          sessionId: this.sessionId,
          threadId: this.threadId,
          runId: event.runId ?? '',
          type: event.type,
          sequence: event.sequence,
          timestamp: event.timestamp,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        })
        .onConflictDoNothing()
        .run();
    }
  }

  child(spawnId: string): RuntimeState {
    return new SqliteRuntimeState(this.db, this.threadId, spawnId);
  }
}
