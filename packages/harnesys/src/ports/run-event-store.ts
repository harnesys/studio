import type { SessionEvent } from './session.ts';

export type PendingSessionEvent = Omit<SessionEvent, 'seq' | 'runId'>;

// biome-ignore lint/style/useConsistentTypeDefinitions: brief specifies interface for RunEventStore
export interface RunEventStore {
  /** Присваивает seq (монотонный в ране), пишет, обновляет runs.lastSeq. Одна транзакция.
   *  Coded 'lease_stale' если ран не в running или epoch чужой. seq присваивается до публикации. */
  append(
    runId: string,
    expectedEpoch: number,
    events: PendingSessionEvent[],
  ): Promise<SessionEvent[]>;
  tail(runId: string, fromSeq: number): Promise<SessionEvent[]>;
  latestSeq(runId: string): Promise<number>;
  /** Вся лента треда в порядке записи (для getThread). */
  listByThread(threadId: string): Promise<SessionEvent[]>;
}
