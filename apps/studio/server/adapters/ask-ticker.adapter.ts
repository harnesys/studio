import type { PendingSessionEvent, RunLifecycleStore } from 'harnesys';
import { ASK_TTL_DEFAULT_MS } from './store/sqlite/repos/sqlite-run-lifecycle.adapter.ts';

const DEFAULT_ASK_TICK_INTERVAL_MS = 60_000;

const EXPIRED_ASKS_BATCH = 50;

export type AskTickerDeps = {
  lifecycle: RunLifecycleStore;
  kick: () => void;
  ttlMs?: number;
  intervalMs?: number;
  onCancelled?: (threadId: string) => void;
};

export function startAskTicker(deps: AskTickerDeps): { stop(): void } {
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
          events: [
            { type: 'error', code: 'ask_expired', message: 'ask expired' } as PendingSessionEvent,
          ],
        });
        deps.kick();
        deps.onCancelled?.(rec.threadId);
      } catch {
        // гонка с respond: transition проиграл CAS, ран уже отвечает
      }
    }
  };
  const interval = setInterval(() => {
    void sweep().catch(() => {
      // тикер переживает ошибки
    });
  }, deps.intervalMs ?? DEFAULT_ASK_TICK_INTERVAL_MS);
  return { stop: () => clearInterval(interval) };
}
