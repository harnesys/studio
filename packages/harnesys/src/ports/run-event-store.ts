import type { SessionEvent } from './session.ts';

type Distribution<T> = T extends unknown ? Omit<T, 'seq' | 'runId'> : never;
export type PendingSessionEvent = Distribution<SessionEvent>;
export type RunSeqAllocator = {
  next(runId: string): number;
};
export interface RunEventStore extends RunSeqAllocator {
  append(runId: string, expectedEpoch: number, events: SessionEvent[]): Promise<SessionEvent[]>;
  tail(runId: string, fromSeq: number): Promise<SessionEvent[]>;
  latestSeq(runId: string): Promise<number>;
  listByThread(threadId: string): Promise<SessionEvent[]>;
  hasRun(runId: string): Promise<boolean>;
  appendForThread(
    threadId: string,
    runId: string,
    events: PendingSessionEvent[],
  ): SessionEvent[] | Promise<SessionEvent[]>;
}
