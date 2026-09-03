import type { RunEventBus } from '../adapters/in-memory-run-store.ts';
import type { RunEventStore } from '../ports/run-event-store.ts';
import type { RunLifecycleStore } from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';

export type RunEventFeed = {
  /**
   * Живые события после fromSeq; завершается на needs_input и терминальных статусах.
   *
   * Гарантия at-least-once: получатель дедуплицирует по (runId, seq).
   */
  subscribe(runId: string, fromSeq: number): AsyncIterable<SessionEvent>;
  /** Вызывает владелец записи (движок) после успешного append. */
  publish(runId: string, events: SessionEvent[]): void;
};

function seqOf(event: SessionEvent): number {
  return (event as { seq?: number }).seq ?? 0;
}

export function createRunEventFeed(deps: {
  events: RunEventStore;
  lifecycle: RunLifecycleStore;
  bus: RunEventBus;
}): RunEventFeed {
  return {
    publish(runId, events) {
      deps.bus.publish(runId, events);
    },
    async *subscribe(runId, fromSeq) {
      // 1) добор истории из стора: источник правды
      const missed = await deps.events.tail(runId, fromSeq);
      let lastSeq = fromSeq;
      for (const ev of missed) {
        lastSeq = Math.max(lastSeq, seqOf(ev));
        yield ev;
      }
      // 2) живая подписка с дедупом по seq
      const live = deps.bus.subscribe(runId);
      const it = live[Symbol.asyncIterator]();
      try {
        while (true) {
          const rec = await deps.lifecycle.get(runId);
          if (rec && rec.status !== 'running' && rec.status !== 'queued') {
            return; // needs_input и терминалы закрывают подписку
          }
          const next = await Promise.race([
            it.next(),
            new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
          ]);
          if (!next) {
            continue; // idle-тик: перепроверить статус выше
          }
          if (next.done) {
            return;
          }
          const batch = Array.isArray(next.value) ? next.value : [next.value];
          for (const ev of batch) {
            if (seqOf(ev) <= lastSeq) {
              continue; // at-least-once, дедуп получателя
            }
            lastSeq = seqOf(ev);
            yield ev;
          }
        }
      } finally {
        it.return?.(undefined);
      }
    },
  };
}
