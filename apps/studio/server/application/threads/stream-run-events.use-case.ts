import type { SessionEvent } from 'harnesys';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import { NotFoundError } from '../../domain/studio.error.ts';

export type StreamRunEventsRequest = {
  runId: string;
};

export type StreamRunEventsInput = {
  execute(request: StreamRunEventsRequest): Promise<AsyncIterable<SessionEvent>>;
};

export class StreamRunEventsUseCase implements StreamRunEventsInput {
  constructor(private readonly activeRuns: ActiveRunRegistry) {}

  execute(request: StreamRunEventsRequest): Promise<AsyncIterable<SessionEvent>> {
    if (!this.activeRuns.get(request.runId)) {
      return Promise.reject(new NotFoundError('run not found'));
    }

    const activeRuns = this.activeRuns;
    const runId = request.runId;

    return Promise.resolve({
      async *[Symbol.asyncIterator]() {
        const queue: SessionEvent[] = [];
        let wake: (() => void) | undefined;
        const unsubscribe = activeRuns.subscribe(runId, (event) => {
          queue.push(event);
          wake?.();
        });
        try {
          while (true) {
            while (queue.length > 0) {
              yield queue.shift() as SessionEvent;
            }
            if (activeRuns.isFinished(runId)) {
              return;
            }
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
            wake = undefined;
          }
        } finally {
          unsubscribe();
        }
      },
    });
  }
}
