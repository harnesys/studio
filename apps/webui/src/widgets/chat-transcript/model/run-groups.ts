import type { SessionEvent } from '@harnesys/studio-shared';
export type RunGroup = {
  id: string | null;
  runId: string | undefined;
  events: SessionEvent[];
  error: string | null;
};
export const RUN_TERMINAL_EVENT_TYPES = new Set([
  'done',
  'error',
  'run.completed',
  'run.failed',
  'run.cancelled',
]);
export function isCompactRun(run: RunGroup): boolean {
  return run.events.some(
    (event) =>
      event.type === 'compaction' ||
      (typeof event.runId === 'string' && event.runId.startsWith('compact:')),
  );
}
export function splitRuns(events: SessionEvent[]): RunGroup[] {
  const runs: RunGroup[] = [];
  let current: SessionEvent[] = [];
  let currentId: string | null = null;
  let currentRunId: string | undefined;
  const closeRun = (error: string | null) => {
    if (current.length > 0) {
      runs.push({ id: currentId, runId: currentRunId, events: current, error });
    }
    current = [];
    currentId = null;
    currentRunId = undefined;
  };
  for (const ev of events) {
    if (RUN_TERMINAL_EVENT_TYPES.has(ev.type)) {
      const failed =
        (ev.type === 'error' || ev.type === 'run.failed') && 'message' in ev ? ev.message : null;
      closeRun(failed);
      continue;
    }
    if (!currentId && ev.type === 'tool' && ev.toolCallId) {
      currentId = ev.toolCallId;
    }
    if (!currentRunId && ev.runId) {
      currentRunId = ev.runId;
    }
    current.push(ev);
  }
  closeRun(null);
  return runs;
}
