import type { RuntimeState } from 'harnesys';

export type RuntimeStateRepository = {
  /** Get or create a RuntimeState for a thread. Rows are removed by the
   *  `snapshots.thread_id` FK cascade when the thread is deleted. */
  forState(threadId: string): RuntimeState;
};
