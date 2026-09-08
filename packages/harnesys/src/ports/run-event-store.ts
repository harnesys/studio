import type { SessionEvent } from './session.ts';

type Distribution<T> = T extends unknown ? Omit<T, 'seq' | 'runId'> : never;

export type PendingSessionEvent = Distribution<SessionEvent>;

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
  /** Есть ли в журнале события рана (спавны живут без run-записи в lifecycle). */
  hasRun(runId: string): Promise<boolean>;
  /** Дописывает события в тред вне lease-проверки (child runs, ручная компакция).
   *  Возвращённые события уже с seq и runId. */
  appendForThread(
    threadId: string,
    runId: string,
    events: PendingSessionEvent[],
  ): SessionEvent[] | Promise<SessionEvent[]>;
}
