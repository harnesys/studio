import { eq } from 'drizzle-orm';
import type { CommitMeta, Event, RuntimeState, Snapshot } from 'harnesys';
import type { StudioDb } from '../connection.ts';
import { snapshotsTable } from '../schema/snapshots.ts';
export class SqliteRuntimeState implements RuntimeState {
  readonly sessionId: string;
  constructor(
    private readonly db: StudioDb,
    private readonly threadId: string,
    sessionId?: string,
    private readonly onEvents?: (threadId: string, events: readonly Event[]) => void,
  ) {
    this.sessionId = sessionId ?? crypto.randomUUID();
  }
  load(): Promise<Snapshot | null> | Snapshot | null {
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
  commit(snapshot: Snapshot, events: readonly Event[], meta: CommitMeta): Promise<void> {
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
    if (this.onEvents) {
      this.onEvents(this.threadId, events);
    }
    return Promise.resolve();
  }
  child(spawnId: string): RuntimeState {
    return new SqliteRuntimeState(this.db, this.threadId, spawnId);
  }
}
