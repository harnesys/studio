import type { SessionEvent } from './session.ts';

export type PendingSessionEvent = Omit<SessionEvent, 'seq' | 'runId'>;

/** Единственная точка выдачи seq рана: синхронно, монотонно, без записи в БД.
 *  Диск может отставать от аллокатора на размер несброшенного батча журнала.
 *  In-process single-writer на ран гарантируется lease/epoch. */
export type RunSeqAllocator = {
  next(runId: string): number;
};

export interface RunEventStore extends RunSeqAllocator {
  /** Пишет события с уже выданным next() seq, обновляет runs.lastSeq. Одна транзакция.
   *  Coded 'lease_stale' если ран не в running или epoch чужой.
   *  Движок публикует событие в feed до append (group commit), поэтому в журнале
   *  допустимы пробелы seq: буфер сбрасывается при lease_stale или краше до записи.
   *  Все потребители сравнивают seq строгим `>` и сортируют по возрастанию. */
  append(runId: string, expectedEpoch: number, events: SessionEvent[]): Promise<SessionEvent[]>;
  tail(runId: string, fromSeq: number): Promise<SessionEvent[]>;
  latestSeq(runId: string): Promise<number>;
  /** Вся лента треда в порядке записи (для getThread). */
  listByThread(threadId: string): Promise<SessionEvent[]>;
}
