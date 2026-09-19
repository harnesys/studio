import type { PendingSessionEvent, RunLifecycleStore } from 'harnesys';
import {
  ASK_TTL_DEFAULT_MS,
  DEFAULT_ASK_TICK_INTERVAL_MS,
  EXPIRED_ASKS_BATCH,
} from '../config/constants.ts';
export type AskTickerDeps = {
  lifecycle: RunLifecycleStore;
  kick: () => void;
  ttlMs?: number;
  intervalMs?: number;
  onCancelled?: (threadId: string) => void;
};
export function startAskTicker(deps: AskTickerDeps): {
  stop(): void;
} {
  const ttl = deps.ttlMs ?? ASK_TTL_DEFAULT_MS;
  const sweep = async (): Promise<void> => {
    const expired = await deps.lifecycle.listExpiredAsks({
      limit: EXPIRED_ASKS_BATCH,
      olderThanMs: ttl,
    });
    for (const rec of expired) {
      try {
        await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
          from: 'needs_input',
          to: 'cancelled',
          events: [{ type: 'run.cancelled', reason: 'ask_expired' } as PendingSessionEvent],
        });
        deps.kick();
        deps.onCancelled?.(rec.threadId);
      } catch {}
    }
  };
  const interval = setInterval(() => {
    void sweep().catch(() => {});
  }, deps.intervalMs ?? DEFAULT_ASK_TICK_INTERVAL_MS);
  return { stop: () => clearInterval(interval) };
}
