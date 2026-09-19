import type { PendingSessionEvent, RunLifecycleStore, RunTargets } from 'harnesys';
import { DEFAULT_WAIT_TICK_INTERVAL_MS, EXPIRED_ASKS_BATCH } from '../config/constants.ts';

export type WaitTickerDeps = {
  lifecycle: RunLifecycleStore;
  targets: RunTargets;
  kick: () => void;
  intervalMs?: number;
};

/**
 * Wakes `waiting` runs whose waitFireAt has passed.
 * sleep → resume { timedOut: false }; gate timeout → onTimeout policy from snapshot.
 */
export function startWaitTicker(deps: WaitTickerDeps): { stop(): void } {
  const sweep = async (): Promise<void> => {
    const due = await deps.lifecycle.listDueTimers({
      limit: EXPIRED_ASKS_BATCH,
      now: Date.now(),
    });
    for (const rec of due) {
      if (!rec.interruptId) {
        continue;
      }
      try {
        const target = await deps.targets.resolve(rec.threadId);
        const snap = await target?.state.load();
        const interrupt = snap?.cursor.interrupt;
        const waitMode = interrupt?.waitMode ?? (interrupt?.source === 'timer' ? 'sleep' : 'gate');
        const onTimeout = interrupt?.onTimeout ?? 'fail';

        if (waitMode === 'gate' && onTimeout === 'fail') {
          await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
            from: 'waiting',
            to: 'failed',
            interruptId: null,
            waitFireAt: null,
            events: [
              {
                type: 'run.failed',
                message: 'wait timed out',
              } as PendingSessionEvent,
            ],
          });
          deps.kick();
          continue;
        }

        if (waitMode === 'gate' && onTimeout === 'interrupt') {
          await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
            from: 'waiting',
            to: 'needs_input',
            waitFireAt: null,
            events: [
              {
                type: 'ask',
                askId: rec.interruptId,
                schema: interrupt?.resumeSchema ?? { type: 'object' },
                source: 'interrupt',
                prompt: interrupt?.reason ?? 'wait timed out',
              } as PendingSessionEvent,
            ],
          });
          deps.kick();
          continue;
        }

        const timedOut = waitMode === 'gate';
        await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
          from: 'waiting',
          to: 'queued',
          interruptId: null,
          waitFireAt: null,
          events: [
            {
              type: 'hitl.answer',
              interruptId: rec.interruptId,
              payload: { timedOut },
            } as PendingSessionEvent,
          ],
        });
        deps.kick();
      } catch {
        // CAS lost to respond/cancel
      }
    }
  };
  const intervalMs = deps.intervalMs ?? DEFAULT_WAIT_TICK_INTERVAL_MS;
  void sweep().catch(() => {});
  const interval = setInterval(() => {
    void sweep().catch(() => {});
  }, intervalMs);
  return { stop: () => clearInterval(interval) };
}
