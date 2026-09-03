import type { SessionEvent } from '../ports/session.ts';

export type SessionEventLog = {
  emit(event: SessionEvent): void;
  stream(isDone: () => boolean): AsyncIterable<SessionEvent>;
};

export function createSessionEventLog(): SessionEventLog {
  const replay: SessionEvent[] = [];
  let wakes: Array<() => void> = [];

  const wakeAll = (): void => {
    const pending = wakes;
    wakes = [];
    for (const w of pending) {
      w();
    }
  };

  return {
    emit(event: SessionEvent): void {
      replay.push(event);
      wakeAll();
    },
    stream(isDone: () => boolean): AsyncIterable<SessionEvent> {
      return {
        async *[Symbol.asyncIterator]() {
          let i = 0;
          while (true) {
            if (i < replay.length) {
              const next = replay[i];
              i += 1;
              if (next) {
                yield next;
              }
              continue;
            }
            if (isDone()) {
              return;
            }
            await new Promise<void>((resolve) => {
              if (i < replay.length || isDone()) {
                resolve();
                return;
              }
              wakes.push(resolve);
            });
          }
        },
      };
    },
  };
}
