import type { FireDueSchedulesInput } from '../application/schedules/fire-due-schedules.use-case.ts';

const DEFAULT_INTERVAL_MS = 15_000;

export function startScheduleTicker(
  fireDue: FireDueSchedulesInput,
  intervalMs = DEFAULT_INTERVAL_MS,
): () => void {
  const tick = () => {
    void fireDue.execute().catch(() => {});
  };
  tick();
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}
