import type { FireDueSchedulesInput } from '../application/schedules/fire-due-schedules.use-case.ts';
import { DEFAULT_SCHEDULE_TICK_INTERVAL_MS } from '../config/constants.ts';
export function startScheduleTicker(
  fireDue: FireDueSchedulesInput,
  intervalMs = DEFAULT_SCHEDULE_TICK_INTERVAL_MS,
): () => void {
  const tick = () => {
    void fireDue.execute().catch(() => {});
  };
  tick();
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}
