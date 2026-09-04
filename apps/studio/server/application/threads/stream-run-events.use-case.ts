import type { RunEventFeed, RunLifecycleStore, SessionEvent } from 'harnesys';
import { NotFoundError } from '../../domain/studio.error.ts';

export type StreamRunEventsRequest = {
  runId: string;
};

export type StreamRunEventsDeps = {
  lifecycle: RunLifecycleStore;
  feed: RunEventFeed;
};

export type StreamRunEventsInput = {
  execute(
    request: StreamRunEventsRequest & { fromSeq?: number },
  ): Promise<AsyncIterable<SessionEvent>>;
};

export class StreamRunEventsUseCase implements StreamRunEventsInput {
  constructor(private readonly deps: StreamRunEventsDeps) {}

  async execute(
    request: StreamRunEventsRequest & { fromSeq?: number },
  ): Promise<AsyncIterable<SessionEvent>> {
    const rec = await this.deps.lifecycle.get(request.runId);
    if (!rec) {
      throw new NotFoundError('run not found');
    }
    return this.deps.feed.subscribe(request.runId, request.fromSeq ?? 0);
  }
}
