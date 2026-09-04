import type { RunEventBus } from '../adapters/in-memory-run-store.ts';
import type { RunEventStore } from '../ports/run-event-store.ts';
import type { RunLifecycleStore } from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';

export type RunEventFeed = {
  /**
   * Живые события после fromSeq; завершается на needs_input и терминальных статусах.
   *
   * Гарантия at-least-once: получатель дедуплицирует по (runId, seq).
   *
   * Порядок закрытия: подписка открывается до чтения истории, батч из шины
   * выдаётся целиком, затем статус проверяется один раз. Переход
   * (guardedTransition) публикует внедрённые кадры (ask / run.completed /
   * run.failed / run.cancelled) после смены статуса, поэтому к моменту drain
   * boundary-батча статус уже установлен: подписка закрывается сразу и без
   * потери хвоста. Idle-тик — только страховка на тихую смерть движка
   * без перехода.
   */
  subscribe(runId: string, fromSeq: number): AsyncIterable<SessionEvent>;
  /** Вызывает владелец записи (движок) после успешного append. */
  publish(runId: string, events: SessionEvent[]): void;
};

const IDLE_BACKSTOP_MS = 5_000;

function seqOf(event: SessionEvent): number {
  return (event as { seq?: number }).seq ?? 0;
}

/** Кадры, после которых статус рана гарантированно сменён (см. guardedTransition). */
function isBoundary(event: SessionEvent): boolean {
  return (
    event.type === 'ask' ||
    event.type === 'done' ||
    event.type === 'error' ||
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  );
}

function isClosedStatus(status: string): boolean {
  return status !== 'running' && status !== 'queued';
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
      // 0) подписка до истории: события между tail-чтением и подпиской
      //    попадут в очередь шины и будут отброшены дедупом по seq
      const live = deps.bus.subscribe(runId);
      const it = live[Symbol.asyncIterator]();
      try {
        // 1) добор истории из стора: источник правды
        const missed = await deps.events.tail(runId, fromSeq);
        let lastSeq = fromSeq;
        for (const ev of missed) {
          lastSeq = Math.max(lastSeq, seqOf(ev));
          yield ev;
        }
        // 2) живой хвост с дедупом по seq
        while (true) {
          const next = await Promise.race([
            it.next(),
            new Promise<null>((r) => setTimeout(() => r(null), IDLE_BACKSTOP_MS)),
          ]);
          if (!next) {
            // idle-тик: шина молчала долго — страховка (тихая смерть движка)
            const rec = await deps.lifecycle.get(runId);
            if (rec && isClosedStatus(rec.status)) {
              return;
            }
            continue;
          }
          if (next.done) {
            return;
          }
          const batch = Array.isArray(next.value) ? next.value : [next.value];
          let boundary = false;
          for (const ev of batch) {
            if (seqOf(ev) <= lastSeq) {
              continue; // at-least-once, дедуп получателя
            }
            lastSeq = seqOf(ev);
            if (isBoundary(ev)) {
              boundary = true;
            }
            yield ev;
          }
          if (boundary) {
            const rec = await deps.lifecycle.get(runId);
            if (rec && isClosedStatus(rec.status)) {
              return; // needs_input и терминалы закрывают подписку
            }
          }
        }
      } finally {
        it.return?.(undefined);
      }
    },
  };
}
