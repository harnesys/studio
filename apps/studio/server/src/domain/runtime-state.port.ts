import type { RuntimeState } from 'harnesys';

export type RuntimeStateRepository = {
  /** Get or create a RuntimeState for a thread. */
  forState(threadId: string): RuntimeState;
  /** Delete all state for a thread. */
  deleteByThread(threadId: string): void;
};
